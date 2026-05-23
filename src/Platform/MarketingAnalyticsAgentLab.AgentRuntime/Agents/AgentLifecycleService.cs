using Azure;
using Azure.AI.OpenAI;
using Azure.Identity;
using MarketingAnalyticsAgentLab.AgentRuntime.Options;
using MarketingAnalyticsAgentLab.AgentRuntime.PluginRegistryClient;
using MarketingAnalyticsAgentLab.Shared.Abstractions;
using MarketingAnalyticsAgentLab.Shared.Agents;
using MarketingAnalyticsAgentLab.Shared.Plugins;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using ModelContextProtocol.Client;

namespace MarketingAnalyticsAgentLab.AgentRuntime.Agents;

/// <summary>
/// Owns the lifecycle of live <see cref="AIAgent"/> instances. Reads declarative
/// <see cref="AgentDefinition"/>s and the published plugins from the centralized
/// Plugin Registry, composes them into <see cref="AIAgent"/>s with the corresponding MCP
/// tools attached, and subscribes to the registry's <c>/events</c> SSE stream so
/// configuration changes propagate without restarts.
///
/// The Gateway only ever asks for a resolved agent by name; this service is what makes
/// sure that name maps to a fully-wired runtime instance.
/// </summary>
public sealed class AgentLifecycleService(
    IPluginRegistryClient registryClient,
    RuntimeAgentRegistry registry,
    IOptions<AzureOpenAIOptions> openAiOptions,
    ILoggerFactory loggerFactory,
    ILogger<AgentLifecycleService> logger,
    IHttpClientFactory httpFactory,
    IConfiguration configuration)
    : BackgroundService
{
    private const string McpClientName = "mcp";
    private int _initialRebuildDone;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // If the host already triggered an initial rebuild synchronously at startup
        // (required for DevUI to discover agents at MapDevUI() time), skip the duplicate
        // rebuild and head straight into the event loop.
        if (Interlocked.CompareExchange(ref _initialRebuildDone, 1, 0) == 0)
        {
            await RebuildAsync(stoppingToken);
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await foreach (var evt in registryClient.SubscribeEventsAsync(stoppingToken))
                {
                    if (string.IsNullOrEmpty(evt.Type)) continue;
                    if (evt.Type.StartsWith("agent.", StringComparison.Ordinal) ||
                        evt.Type.StartsWith("plugin.", StringComparison.Ordinal))
                    {
                        logger.LogInformation("Registry event '{Type}' received - rebuilding agents.", evt.Type);
                        await RebuildAsync(stoppingToken);
                    }
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Lost connection to PluginRegistry /events; retrying in 5s.");
                try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
                catch (OperationCanceledException) { break; }
            }
        }
    }

    /// <summary>
    /// Runs the first rebuild synchronously from the host startup path so consumers like
    /// DevUI (which eagerly resolves every registered agent at <c>MapDevUI()</c> time) see a
    /// populated registry before the HTTP pipeline starts. Marks the initial-rebuild flag so
    /// the background <see cref="ExecuteAsync"/> loop doesn't repeat the work.
    ///
    /// Handles the startup race where mcp-server's <c>DynamicPluginToolHost</c> is still
    /// loading published plugins in its own BackgroundService when agent-runtime fires its
    /// initial Prime. Aspire's <c>WaitFor(mcp-server)</c> only waits for the listener to come
    /// up - it doesn't know about the in-process tool-load latency. Without this retry, the
    /// initial rebuild can register agents against an empty MCP tool list, the
    /// "no tools attached" guardrail fires, and the operator is stuck until they manually
    /// click "Reload AgentRuntime".
    /// </summary>
    public async Task PrimeAsync(CancellationToken ct)
    {
        const int MaxAttempts = 8;
        var delay = TimeSpan.FromSeconds(1);

        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            await RebuildAsync(ct);

            var agentDefs = await SafeListAgentDefinitionsAsync(ct);
            var expectsTools = agentDefs.Any(a => a.PluginIds.Count > 0);
            var anyAgentHasTools = registry.List().Any(a => a.Tools.Count > 0);

            if (!expectsTools || anyAgentHasTools)
            {
                if (attempt > 1)
                {
                    logger.LogInformation(
                        "Agent runtime primed after {Attempts} attempt(s). Live agents: {AgentCount}.",
                        attempt, registry.List().Count);
                }
                break;
            }

            if (attempt == MaxAttempts)
            {
                logger.LogWarning(
                    "After {Attempts} attempts the MCP tool list was still empty although " +
                    "{AgentsWithPlugins} agent(s) expect tools. Continuing with the guardrail " +
                    "agents - inspect mcp-server logs and click 'Reload AgentRuntime' once it " +
                    "reports its tools.",
                    MaxAttempts, agentDefs.Count(a => a.PluginIds.Count > 0));
                break;
            }

            logger.LogInformation(
                "MCP tool list is empty but agents expect tools - retrying in {DelayMs}ms (attempt {Attempt}/{MaxAttempts}).",
                (int)delay.TotalMilliseconds, attempt, MaxAttempts);
            try { await Task.Delay(delay, ct); }
            catch (OperationCanceledException) { break; }
            // Linear-ish backoff: 1s, 1.5s, 2s, 2.5s, 3s, 3.5s, 4s -> ~17.5s total budget.
            delay += TimeSpan.FromMilliseconds(500);
        }

        Interlocked.Exchange(ref _initialRebuildDone, 1);
    }

    private async Task<IReadOnlyList<Shared.Agents.AgentDefinition>> SafeListAgentDefinitionsAsync(CancellationToken ct)
    {
        try { return await registryClient.ListAgentsAsync(ct); }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not list agent definitions during prime.");
            return Array.Empty<Shared.Agents.AgentDefinition>();
        }
    }

    public async Task RebuildAsync(CancellationToken ct)
    {
        try
        {
            var definitions = await registryClient.ListAgentsAsync(ct);
            var plugins = await registryClient.ListPublishedPluginsAsync(ct);
            var pluginById = plugins.ToDictionary(p => p.Id);

            var chatClient = TryCreateChatClient();
            if (chatClient is null)
            {
                logger.LogWarning("Azure OpenAI not configured; agents will not be functional. Set Parameters:AzureOpenAIEndpoint via user-secrets on the AppHost.");
                return;
            }

            var mcpClient = await TryCreateMcpClientAsync(ct);
            IReadOnlyList<McpClientTool> mcpTools = mcpClient is null
                ? Array.Empty<McpClientTool>()
                : (await mcpClient.ListToolsAsync(cancellationToken: ct)).ToArray();

            registry.Clear();
            foreach (var def in definitions)
            {
                var (agent, descriptor, toolToPlugin) = BuildAgent(def, chatClient, mcpTools, pluginById);
                registry.Replace(def.Name, descriptor, agent, toolToPlugin);
                logger.LogInformation("Registered agent {Agent} with {Count} tools.", def.Name, descriptor.Tools.Count);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to rebuild agents.");
        }
    }

    private (AIAgent agent, AgentDescriptor descriptor, IReadOnlyDictionary<string, string> toolToPlugin)
        BuildAgent(AgentDefinition def, IChatClient chatClient,
                   IReadOnlyList<McpClientTool> allMcpTools,
                   IReadOnlyDictionary<Guid, PluginDefinition> pluginById)
    {
        // Map every plugin tool name -> originating plugin display name so the runtime can
        // attribute tool calls back to plugins in its response.
        var allowedToolNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var pluginNames = new List<string>();
        foreach (var pluginId in def.PluginIds)
        {
            if (!pluginById.TryGetValue(pluginId, out var plugin)) continue;
            pluginNames.Add(plugin.DisplayName);
            foreach (var endpoint in plugin.Endpoints)
            {
                allowedToolNames[endpoint.ToolName] = plugin.DisplayName;
            }
        }

        var tools = allMcpTools
            .Where(t => allowedToolNames.ContainsKey(t.Name))
            .Cast<AITool>()
            .ToList();

        // Guardrail: a tool-less agent registered in DevUI / the Gateway will happily
        // hallucinate plausible-looking but fabricated metrics when a user asks a data
        // question. We've seen this confuse first-time testers who skipped Step 7 of the
        // end-to-end guide (attach plugins). Detect the misconfiguration explicitly and
        // append a hard "no tools available" directive to the system prompt so the agent
        // surfaces the issue instead of inventing numbers. Recovery is operator-facing:
        // attach plugins in the Admin Portal and click "Reload AgentRuntime".
        var effectiveInstructions = def.Instructions;
        if (tools.Count == 0)
        {
            logger.LogWarning(
                "Agent {Agent} has no usable tools (PluginIds={PluginCount}, MatchedTools=0); registering with a 'no tools attached' guardrail to prevent hallucinations.",
                def.Name, def.PluginIds.Count);
            effectiveInstructions = def.Instructions + """


                ===================================================================
                IMPORTANT - PLATFORM GUARDRAIL
                You currently have NO plugins or tools attached, so you cannot
                fetch real data. If the user asks anything that would require
                live information (analytics, campaigns, customers, notifications,
                metrics, dates, counts, rates, statuses, etc.) you MUST NOT
                attempt to answer it. Do NOT invent values. Do NOT narrate fake
                tool calls. Reply EXACTLY with the sentence below and nothing else:

                  "I don't have any data sources attached yet. Please ask an
                  operator to attach the relevant plugins to me in the Admin
                  Portal, then click Reload AgentRuntime."
                ===================================================================
                """;
        }

        var agent = chatClient.AsAIAgent(
            name: def.Name,
            instructions: effectiveInstructions,
            description: def.Description,
            tools: tools);

        var descriptor = new AgentDescriptor(
            Name: def.Name,
            DisplayName: def.DisplayName,
            Description: def.Description,
            Plugins: pluginNames,
            Tools: tools.Select(t => t.Name).ToArray());

        return (agent, descriptor, allowedToolNames);
    }

    private IChatClient? TryCreateChatClient()
    {
        var opts = openAiOptions.Value;
        if (!opts.HasEndpoint) return null;

        var endpoint = new Uri(opts.Endpoint);
        AzureOpenAIClient openAi = opts.HasApiKey
            ? new AzureOpenAIClient(endpoint, new AzureKeyCredential(opts.ApiKey))
            : new AzureOpenAIClient(endpoint, new DefaultAzureCredential());

        IChatClient chat = openAi.GetChatClient(opts.Deployment).AsIChatClient();
        chat = new ChatClientBuilder(chat)
            .UseOpenTelemetry(sourceName: "Microsoft.Agents.AI")
            .Build();
        return chat;
    }

    private async Task<McpClient?> TryCreateMcpClientAsync(CancellationToken ct)
    {
        try
        {
            // The MCP transport refuses to accept Aspire's "https+http://" symbolic scheme
            // (HttpClientTransportOptions.Endpoint validates http/https at config time, before
            // ServiceDiscovery ever gets a chance to resolve it). Read the already-resolved
            // absolute URL from Aspire-injected configuration instead.
            var endpoint = ResolveMcpEndpoint();
            if (endpoint is null)
            {
                logger.LogWarning(
                    "No mcp-server endpoint found in configuration (looked for services:mcp-server:https:0 and :http:0). " +
                    "Tools will be unavailable until Aspire wires up the reference.");
                return null;
            }

            var httpClient = httpFactory.CreateClient(McpClientName);
            var transport = new HttpClientTransport(
                new HttpClientTransportOptions
                {
                    Name = "marketing-mcp",
                    Endpoint = endpoint,
                },
                httpClient,
                loggerFactory);
            return await McpClient.CreateAsync(transport, loggerFactory: loggerFactory, cancellationToken: ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to connect to MCP server; tools will be unavailable.");
            return null;
        }
    }

    /// <summary>
    /// Resolves the mcp-server endpoint from Aspire-injected configuration. Aspire writes
    /// <c>services__mcp-server__https__0</c> / <c>services__mcp-server__http__0</c> env vars
    /// when <c>.WithReference(mcpServer)</c> is declared in the AppHost; the .NET config system
    /// turns the double underscores into colons. Returns the HTTPS endpoint when available,
    /// otherwise falls back to HTTP. Returns <c>null</c> if neither was injected.
    /// </summary>
    internal Uri? ResolveMcpEndpoint()
    {
        for (var i = 0; i < 4; i++)
        {
            var https = configuration[$"services:mcp-server:https:{i}"];
            if (!string.IsNullOrWhiteSpace(https) && Uri.TryCreate(https, UriKind.Absolute, out var httpsUri))
            {
                return httpsUri;
            }
        }
        for (var i = 0; i < 4; i++)
        {
            var http = configuration[$"services:mcp-server:http:{i}"];
            if (!string.IsNullOrWhiteSpace(http) && Uri.TryCreate(http, UriKind.Absolute, out var httpUri))
            {
                return httpUri;
            }
        }
        return null;
    }
}
