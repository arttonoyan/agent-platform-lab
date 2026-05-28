using System.Diagnostics;
using System.Net.ServerSentEvents;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Elsa.Common.Models;
using Elsa.Workflows.Management;
using Elsa.Workflows.Options;
using Elsa.Workflows.Runtime;
using MarketingAnalyticsAgentLab.AgentRuntime.Agents;
using MarketingAnalyticsAgentLab.AgentRuntime.Elsa;
using MarketingAnalyticsAgentLab.AgentRuntime.Options;
using MarketingAnalyticsAgentLab.RuntimeTelemetry.Chat;
using MarketingAnalyticsAgentLab.Shared.Abstractions;
using MarketingAnalyticsAgentLab.Shared.Interaction;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using ModelContextProtocol.Client;

namespace MarketingAnalyticsAgentLab.AgentRuntime.Endpoints;

public static class AgentRunEndpoints
{
    public sealed record AgentStreamFrame(string Type, string? Text, string? ToolName, string? Plugin, string? ToolJson);

    public static IEndpointRouteBuilder MapAgentRunEndpoints(this IEndpointRouteBuilder app)
    {
        var agents = app.MapGroup("/agents").WithTags("Agents");

        agents.MapGet("/", (RuntimeAgentRegistry liveRegistry, WorkflowAgentRegistry workflowRegistry) =>
        {
            // Union of (a) simple AIAgents loaded from YAML and (b) composite agents
            // wrapping published Elsa workflows. Same descriptor shape — only the Kind
            // property differs — so Atlas / Playground / Gateway see one unified list.
            // Simple agents come first to preserve the existing order for callers that
            // iterate without sorting.
            var combined = new List<AgentDescriptor>();
            combined.AddRange(liveRegistry.List());
            combined.AddRange(workflowRegistry.List());
            return combined;
        })
            .WithName("ListAgents")
            .WithSummary("List all available agents — simple (single LLM + tools) and composite (multi-step workflow).");

        agents.MapPost("/reload", async (AgentLifecycleService lifecycle, CancellationToken ct) =>
        {
            await lifecycle.RebuildAsync(ct);
            return Results.Ok(new { reloaded = true });
        })
            .WithName("ReloadAgents")
            .WithSummary("Force-reload agents from PluginRegistry. Useful when the SSE feed is unavailable.");

        agents.MapGet("/composite/diagnose", async (WorkflowAgentBridge bridge, CancellationToken ct) =>
            await bridge.DiagnoseAsync(ct))
            .WithName("DiagnoseCompositeAgents")
            .WithSummary("Per-workflow report explaining which published workflows the WorkflowAgentBridge promoted to composite agents and why others were skipped.");

        // Create + publish an empty composite-agent scaffold in one shot. The AdminPortal's
        // "+ New agent → Workflow" flow POSTs here; the response carries the workflow
        // definition id so the client can deep-link the operator into Elsa Studio focused
        // on the new workflow for further editing.
        agents.MapPost("/composite", async (
            CompositeAgentScaffoldService.CreateCompositeAgentRequest request,
            CompositeAgentScaffoldService service,
            WorkflowAgentBridge bridge,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return Results.BadRequest(new { error = "name is required." });
            }

            try
            {
                var result = await service.CreateAsync(request, ct);
                // Force an immediate bridge refresh so the new composite agent shows up
                // in /agents without waiting for the next 10-s poll tick — the caller's
                // next listAgents() poll picks it up right away.
                _ = bridge.DiagnoseAsync(ct);
                return Results.Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        })
            .WithName("CreateCompositeAgent")
            .WithSummary("Create + publish a composite agent (wraps an Elsa workflow with the prompt/response shape the bridge expects).");

        // Diagnostic-only: connects to MCP and reports exactly what it sees. Surfaces silent
        // failures that the existing TryCreateMcpClient swallows into a LogWarning. Hit this
        // when agent-runtime appears to have empty tool sets despite MCP showing tools live
        // on its own /status endpoint.
        agents.MapGet("/diagnostics/mcp", async (
            AgentLifecycleService lifecycle,
            IHttpClientFactory httpFactory,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var sw = Stopwatch.StartNew();
            try
            {
                var endpoint = lifecycle.ResolveMcpEndpoint();
                if (endpoint is null)
                {
                    return Results.Ok(new
                    {
                        status = "error",
                        durationMs = (int)sw.ElapsedMilliseconds,
                        message = "No mcp-server endpoint found in Aspire-injected configuration.",
                    });
                }

                var http = httpFactory.CreateClient("mcp");
                var transport = new HttpClientTransport(
                    new HttpClientTransportOptions
                    {
                        Name = "diagnostic-probe",
                        Endpoint = endpoint,
                    },
                    http,
                    loggerFactory);

                await using var mcp = await McpClient.CreateAsync(transport, loggerFactory: loggerFactory, cancellationToken: ct);
                var tools = await mcp.ListToolsAsync(cancellationToken: ct);
                sw.Stop();
                return Results.Ok(new
                {
                    status = "ok",
                    endpoint = endpoint.ToString(),
                    toolCount = tools.Count,
                    toolNames = tools.Select(t => t.Name).ToArray(),
                    durationMs = (int)sw.ElapsedMilliseconds,
                });
            }
            catch (Exception ex)
            {
                sw.Stop();
                return Results.Ok(new
                {
                    status = "error",
                    durationMs = (int)sw.ElapsedMilliseconds,
                    exceptionType = ex.GetType().FullName,
                    message = ex.Message,
                    inner = ex.InnerException?.Message,
                    stack = ex.StackTrace?.Split('\n').Take(6).ToArray(),
                });
            }
        })
            .WithName("DiagnoseMcpConnection")
            .WithSummary("Diagnostic-only: connect to MCP and surface the exact failure mode (or the live tool list).");

        agents.MapPost("/{name}/run", async (
            RuntimeAgentRegistry registry,
            WorkflowAgentRegistry workflowRegistry,
            IServiceProvider services,
            IOptions<AzureOpenAIOptions> openAiOptions,
            string name,
            AgentRunRequest request,
            CancellationToken ct) =>
        {
            // Composite (workflow-backed) agents take a different path: we hand off to
            // the Elsa workflow runner instead of an AIAgent. Token usage is still
            // captured (the workflow's RunAgentActivity steps run inside the same
            // TokenUsageCapturingChatClient ambient scope).
            if (workflowRegistry.TryGetWorkflowDefinitionId(name, out var workflowDefinitionId) && workflowDefinitionId is not null)
            {
                return await RunWorkflowAgentAsync(name, workflowDefinitionId, request, services, openAiOptions.Value.Deployment, ct);
            }

            if (!registry.TryGet(name, out var agent) || agent is null)
            {
                return Results.NotFound(new { error = $"Agent '{name}' is not registered." });
            }

            var toolMetadata = registry.GetToolMetadata(name);
            var collected = new List<AssistantToolCall>();
            var argsByCallId = new Dictionary<string, (string Tool, string ArgsJson, long StartedAtMs)>();
            var text = new StringBuilder();
            var sw = Stopwatch.StartNew();

            // Capture token usage from every IChatClient call made inside this agent run
            // (including subsequent LLM turns triggered by tool results). The middleware
            // wired into the chat client (UseTokenUsageCapture) reads this accumulator
            // off AsyncLocal and folds in each response's usage details.
            var usage = new TokenUsageAccumulator { ModelId = openAiOptions.Value.Deployment };
            using (TokenUsageCapturingChatClient.Capture(usage))
            {
                await foreach (var update in agent.RunStreamingAsync(request.Message, cancellationToken: ct))
                {
                    foreach (var content in update.Contents)
                    {
                        switch (content)
                        {
                            case TextContent t when !string.IsNullOrEmpty(t.Text):
                                text.Append(t.Text);
                                break;
                            case FunctionCallContent call:
                                var argsJson = call.Arguments is null ? null : JsonSerializer.Serialize(call.Arguments);
                                argsByCallId[call.CallId] = (call.Name, argsJson ?? "{}", sw.ElapsedMilliseconds);
                                break;
                            case FunctionResultContent result:
                                if (argsByCallId.TryGetValue(result.CallId, out var meta))
                                {
                                    toolMetadata.TryGetValue(meta.Tool, out var endpoint);
                                    var resultPreview = result.Result?.ToString();
                                    var status = ClassifyToolResult(resultPreview);
                                    if (resultPreview is { Length: > 240 })
                                    {
                                        resultPreview = resultPreview[..240] + "...";
                                    }
                                    collected.Add(new AssistantToolCall(
                                        Plugin: endpoint?.PluginName ?? "(unknown)",
                                        Tool: meta.Tool,
                                        ArgumentsJson: meta.ArgsJson,
                                        ResultPreview: resultPreview,
                                        DurationMs: (int)(sw.ElapsedMilliseconds - meta.StartedAtMs),
                                        SourceMethod: endpoint?.Method,
                                        SourcePath: endpoint?.Path,
                                        Status: status));
                                }
                                break;
                        }
                    }
                }
            }

            sw.Stop();
            return Results.Ok(new AgentRunResponse(
                Message: text.ToString(),
                ToolCalls: collected,
                Model: usage.ModelId,
                InputTokens: usage.InputTokens,
                OutputTokens: usage.OutputTokens,
                LatencyMs: (int)sw.ElapsedMilliseconds));
        })
            .WithName("RunAgent")
            .WithSummary("Run an agent and return the final message + captured tool calls with plugin attribution, model id, and token usage.");

        agents.MapPost("/{name}/run/stream", (
            RuntimeAgentRegistry registry,
            string name,
            AgentRunRequest request,
            CancellationToken ct) =>
        {
            if (!registry.TryGet(name, out var agent) || agent is null)
            {
                return Results.NotFound(new { error = $"Agent '{name}' is not registered." });
            }
            var toolToPlugin = registry.GetToolToPluginMap(name);
            return TypedResults.ServerSentEvents(
                StreamAsync(agent, toolToPlugin, request, ct),
                eventType: "message");
        })
            .WithName("RunAgentStream")
            .WithSummary("Stream agent output as SSE. Used by DevUI and (optionally) by Gateway for streaming.");

        return app;
    }

    private static async IAsyncEnumerable<SseItem<AgentStreamFrame>> StreamAsync(
        AIAgent agent,
        IReadOnlyDictionary<string, string> toolToPlugin,
        AgentRunRequest request,
        [EnumeratorCancellation] CancellationToken ct)
    {
        await foreach (var update in agent.RunStreamingAsync(request.Message, cancellationToken: ct))
        {
            foreach (var content in update.Contents)
            {
                switch (content)
                {
                    case TextContent t when !string.IsNullOrEmpty(t.Text):
                        yield return new SseItem<AgentStreamFrame>(new AgentStreamFrame("token", t.Text, null, null, null));
                        break;
                    case FunctionCallContent call:
                        var plugin = toolToPlugin.TryGetValue(call.Name, out var p) ? p : null;
                        var argsJson = call.Arguments is null ? null : JsonSerializer.Serialize(call.Arguments);
                        yield return new SseItem<AgentStreamFrame>(new AgentStreamFrame("tool_call", null, call.Name, plugin, argsJson));
                        break;
                    case FunctionResultContent result:
                        yield return new SseItem<AgentStreamFrame>(new AgentStreamFrame("tool_result", null, null, null, result.Result?.ToString()));
                        break;
                }
            }
        }
        yield return new SseItem<AgentStreamFrame>(new AgentStreamFrame("done", null, null, null, null));
    }

    /// <summary>
    /// Coarse status classification for a tool result string. The runtime sees only the
    /// stringified result returned by MCP — failures are surfaced as JSON envelopes like
    /// <c>{"error":"..."}</c> and policy denials as <c>{"error":"policy.denied", ...}</c>.
    /// Mirrors the categories the dashboard renders so the Gateway can persist them as-is.
    /// </summary>
    private static string ClassifyToolResult(string? resultPreview)
    {
        if (string.IsNullOrEmpty(resultPreview)) return "succeeded";
        if (resultPreview.Contains("policy.denied", StringComparison.OrdinalIgnoreCase)) return "denied";
        if (resultPreview.StartsWith("{\"error\"", StringComparison.OrdinalIgnoreCase)) return "failed";
        return "succeeded";
    }

    /// <summary>
    /// Dispatch handler for composite (workflow-backed) agents. Resolves the published
    /// workflow graph by its definition id, runs it through Elsa's <see cref="IWorkflowInvoker"/>
    /// with the user message bound to the workflow's <c>prompt</c> input, and reads the
    /// <c>response</c> output from the resulting workflow state to return the agent reply.
    /// Token usage is captured via the same ambient accumulator that simple agents use,
    /// so the Playground's tokens/cost UI works identically.
    /// </summary>
    private static async Task<IResult> RunWorkflowAgentAsync(
        string agentName,
        string workflowDefinitionId,
        AgentRunRequest request,
        IServiceProvider services,
        string modelDeployment,
        CancellationToken ct)
    {
        var definitionService = services.GetRequiredService<IWorkflowDefinitionService>();
        var invoker = services.GetRequiredService<IWorkflowInvoker>();
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("AgentRunEndpoints.Composite");

        var graph = await definitionService.FindWorkflowGraphAsync(workflowDefinitionId, VersionOptions.Published, ct);
        if (graph is null)
        {
            return Results.NotFound(new
            {
                error = $"Composite agent '{agentName}' points at workflow '{workflowDefinitionId}', " +
                        "but no published version of that workflow is currently in the database. " +
                        "Republish the workflow in Elsa Studio.",
            });
        }

        var sw = Stopwatch.StartNew();
        var usage = new TokenUsageAccumulator { ModelId = modelDeployment };

        // Capturing the accumulator on AsyncLocal lets every IChatClient call inside
        // the workflow's RunAgentActivity steps fold its token usage in — composite
        // agents report the aggregate across all internal LLM calls.
        // Fully-qualified type because the project's own .Elsa namespace shadows the
        // Elsa.* root when resolving model types from this file's using directives.
        global::Elsa.Workflows.Models.RunWorkflowResult result;
        using (TokenUsageCapturingChatClient.Capture(usage))
        {
            result = await invoker.InvokeAsync(graph, new RunWorkflowOptions
            {
                Input = new Dictionary<string, object> { ["prompt"] = request.Message ?? string.Empty },
            }, ct);
        }
        sw.Stop();

        // Reading the workflow's reply happens in two stages, in priority order:
        //   1. WorkflowState.Output["response"] — populated when the author explicitly
        //      wired the workflow-level output (e.g. via a Finish/Set Output activity).
        //      This is the canonical path and the right thing to use for multi-step
        //      workflows where multiple activities might contribute partial state.
        //   2. Last activity's Result — for the common "wrap one agent" case the author
        //      hasn't wired the workflow output at all; the agent activity's Result is
        //      sitting in the ActivityOutputRegister but never propagated to the
        //      workflow output dictionary. Reading the most recently produced Result
        //      makes the simplest possible composite-agent (a workflow with one Run
        //      Agent step) work without any extra wiring on the author's part.
        // If both fail, we log the full output snapshot so the operator can see exactly
        // what the workflow produced and why we couldn't find a reply.
        var workflowOutput = TryReadResponseFromOutputs(result.WorkflowState.Output);

        if (string.IsNullOrEmpty(workflowOutput))
        {
            workflowOutput = TryReadResponseFromLastActivity(result);
        }

        if (string.IsNullOrEmpty(workflowOutput))
        {
            var outputs = result.WorkflowState.Output;
            var keys = outputs is null ? "<null dictionary>" : string.Join(", ", outputs.Keys);
            var values = outputs is null
                ? "<null>"
                : string.Join("; ", outputs.Select(kv => $"{kv.Key}={Stringify(kv.Value)}"));
            logger.LogWarning(
                "Composite agent '{Agent}' ran but no string response was found. " +
                "WorkflowState.Output keys: [{Keys}]. Full snapshot: [{Values}]. " +
                "Add a Finish/Set Output activity that writes to the workflow output named 'response', " +
                "or ensure the final activity produces a string Result.",
                agentName, keys, values);
        }

        return Results.Ok(new AgentRunResponse(
            Message: workflowOutput,
            ToolCalls: Array.Empty<AssistantToolCall>(),
            Model: usage.ModelId,
            InputTokens: usage.InputTokens,
            OutputTokens: usage.OutputTokens,
            LatencyMs: (int)sw.ElapsedMilliseconds));
    }

    /// <summary>
    /// Trims long output values to keep the diagnostic log line readable. Run a workflow
    /// that produces a 50KB JSON blob in an output variable and you don't want that
    /// blob in every log line — just enough to identify the value.
    /// </summary>
    private static string Stringify(object? value)
    {
        if (value is null) return "<null>";
        var s = value.ToString() ?? string.Empty;
        return s.Length > 120 ? s[..120] + "..." : s;
    }

    /// <summary>
    /// Canonical path: read the workflow output named <c>response</c>. Returns empty
    /// when the author hasn't explicitly wired the workflow's `response` output, which
    /// is the common case for a one-activity scaffold.
    /// </summary>
    private static string TryReadResponseFromOutputs(IDictionary<string, object>? outputs)
    {
        if (outputs is null) return string.Empty;
        return outputs.TryGetValue("response", out var responseObj) && responseObj is not null
            ? responseObj.ToString() ?? string.Empty
            : string.Empty;
    }

    /// <summary>
    /// Fallback path: walk the execution journal in reverse and return the first
    /// activity's Result that resolves to a non-empty string. This covers the simple
    /// "Hello Agent" shape — workflow has one Run Agent step, no explicit output
    /// binding — so the user gets the reply they expect without authoring boilerplate.
    /// Multi-step workflows that produce intermediate strings still pick the LAST one
    /// (which is normally the terminal step's result).
    /// </summary>
    private static string TryReadResponseFromLastActivity(global::Elsa.Workflows.Models.RunWorkflowResult result)
    {
        var register = result.WorkflowExecutionContext.GetActivityOutputRegister();
        // ActivityExecutionContexts is in execution order; iterate from the end so the
        // most recently completed activity wins. The "Result" key is Elsa's default
        // output name for CodeActivity<T> — see ActivityOutputRegister.DefaultOutputName.
        foreach (var ctx in result.Journal.ActivityExecutionContexts.Reverse())
        {
            var value = register.FindOutputByActivityInstanceId(ctx.Id, "Result");
            if (value is string s && !string.IsNullOrWhiteSpace(s))
            {
                return s;
            }
        }
        return string.Empty;
    }
}
