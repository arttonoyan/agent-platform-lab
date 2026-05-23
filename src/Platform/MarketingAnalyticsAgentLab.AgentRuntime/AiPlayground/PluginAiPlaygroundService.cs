using System.Diagnostics;
using Azure;
using Azure.AI.OpenAI;
using Azure.Identity;
using MarketingAnalyticsAgentLab.AgentRuntime.Options;
using MarketingAnalyticsAgentLab.AgentRuntime.PluginRegistryClient;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;

namespace MarketingAnalyticsAgentLab.AgentRuntime.AiPlayground;

/// <summary>
/// Runs a single LLM conversation against a single plugin's tools. Used by the Admin Portal's
/// AI Playground tab to validate that the plugin's <c>ToolName</c> + <c>ToolDescription</c>
/// pair is good enough for the LLM to (1) pick the tool, (2) populate its arguments correctly,
/// and (3) produce a useful natural-language summary from the result.
///
/// The plugin does NOT need to be published - we construct ephemeral tools straight from the
/// plugin definition so the operator can iterate on tool descriptions before committing to MCP.
/// </summary>
public sealed class PluginAiPlaygroundService(
    IPluginRegistryClient registryClient,
    IHttpClientFactory httpFactory,
    IOptions<AzureOpenAIOptions> openAiOptions,
    ILogger<PluginAiPlaygroundService> logger)
{
    private const string DownstreamClientName = "ai-playground-downstream";
    private const string SystemPrompt =
        """
        You are an operator-facing tool tester for the Marketing Analytics platform. The user
        is iterating on a plugin and wants to see whether you can use it correctly.

        Rules:
        1. You have access to ONE plugin's tools and nothing else.
        2. ALWAYS call a tool when the user asks a data question. Never invent values.
        3. After the tool returns, summarise the result in two or three short sentences with
           concrete numbers and dates.
        4. If no available tool fits, say so plainly - do not improvise.
        """;

    public async Task<PluginAiPlaygroundResult> RunAsync(Guid pluginId, string userMessage, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();

        var plugin = await registryClient.GetPluginAsync(pluginId, ct);
        if (plugin is null)
        {
            return PluginAiPlaygroundResult.Failure("Plugin not found.", sw);
        }
        if (plugin.Endpoints.Count == 0)
        {
            return PluginAiPlaygroundResult.Failure("Plugin has no endpoints configured.", sw);
        }

        var spec = await registryClient.GetApiSpecAsync(plugin.ApiSpecId, ct);
        if (spec is null)
        {
            return PluginAiPlaygroundResult.Failure(
                $"Plugin '{plugin.DisplayName}' references API spec {plugin.ApiSpecId} but that spec is not on disk. " +
                "Re-import the API and retry.",
                sw);
        }

        var chatClient = TryCreateChatClient();
        if (chatClient is null)
        {
            return PluginAiPlaygroundResult.Failure(
                "Azure OpenAI is not configured on the AgentRuntime. Set Parameters:AzureOpenAIEndpoint via user-secrets on the AppHost.",
                sw);
        }

        var capture = new List<CapturedToolCall>();
        var http = httpFactory.CreateClient(DownstreamClientName);
        var tools = plugin.Endpoints
            .Select(ep => (AITool)new PluginToolAIFunction(ep, plugin.Auth, spec.BaseAddress, http, capture))
            .ToList();

        try
        {
            var response = await chatClient.GetResponseAsync(
                messages: new[]
                {
                    new ChatMessage(ChatRole.System, SystemPrompt),
                    new ChatMessage(ChatRole.User, userMessage),
                },
                options: new ChatOptions
                {
                    Tools = tools,
                    // ToolMode = ChatToolMode.Auto is the default - the LLM decides whether to call a tool.
                },
                cancellationToken: ct);

            sw.Stop();
            return new PluginAiPlaygroundResult(
                Reply: response.Text ?? string.Empty,
                ToolCalls: capture,
                DurationMs: (int)sw.ElapsedMilliseconds,
                Error: null);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "AI playground run failed for plugin {Plugin}.", plugin.Name);
            sw.Stop();
            return new PluginAiPlaygroundResult(
                Reply: string.Empty,
                ToolCalls: capture,
                DurationMs: (int)sw.ElapsedMilliseconds,
                Error: ex.Message);
        }
    }

    private IChatClient? TryCreateChatClient()
    {
        var opts = openAiOptions.Value;
        if (!opts.HasEndpoint) return null;

        var endpoint = new Uri(opts.Endpoint);
        AzureOpenAIClient openAi = opts.HasApiKey
            ? new AzureOpenAIClient(endpoint, new AzureKeyCredential(opts.ApiKey))
            : new AzureOpenAIClient(endpoint, new DefaultAzureCredential());

        // FunctionInvokingChatClient wraps the underlying chat client and auto-invokes the
        // tools the LLM calls. Without this wrapper the LLM would emit FunctionCall content
        // and we'd have to dispatch it manually - the wrapper short-circuits that and the
        // PluginToolAIFunction.capture list still records every invocation.
        return openAi.GetChatClient(opts.Deployment).AsIChatClient()
            .AsBuilder()
            .UseFunctionInvocation()
            .UseOpenTelemetry(sourceName: "Microsoft.Agents.AI")
            .Build();
    }
}

public sealed record PluginAiPlaygroundResult(
    string Reply,
    IReadOnlyList<CapturedToolCall> ToolCalls,
    int DurationMs,
    string? Error)
{
    internal static PluginAiPlaygroundResult Failure(string error, Stopwatch sw)
    {
        sw.Stop();
        return new PluginAiPlaygroundResult(string.Empty, Array.Empty<CapturedToolCall>(), (int)sw.ElapsedMilliseconds, error);
    }
}
