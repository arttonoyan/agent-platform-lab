using System.Diagnostics;
using System.Net.ServerSentEvents;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using MarketingAnalyticsAgentLab.AgentRuntime.Agents;
using MarketingAnalyticsAgentLab.AgentRuntime.Options;
using MarketingAnalyticsAgentLab.RuntimeTelemetry.Chat;
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

        agents.MapGet("/", (RuntimeAgentRegistry registry) => registry.List())
            .WithName("ListAgents")
            .WithSummary("List all live agents with display name, description, and bound tools.");

        agents.MapPost("/reload", async (AgentLifecycleService lifecycle, CancellationToken ct) =>
        {
            await lifecycle.RebuildAsync(ct);
            return Results.Ok(new { reloaded = true });
        })
            .WithName("ReloadAgents")
            .WithSummary("Force-reload agents from PluginRegistry. Useful when the SSE feed is unavailable.");

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
            IOptions<AzureOpenAIOptions> openAiOptions,
            string name,
            AgentRunRequest request,
            CancellationToken ct) =>
        {
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
}
