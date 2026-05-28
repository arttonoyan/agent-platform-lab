using System.Diagnostics;
using System.Text;
using System.Text.Json;
using MarketingAnalyticsAgentLab.AgentRuntime.Agents;
using MarketingAnalyticsAgentLab.AgentRuntime.Workflows;
using MarketingAnalyticsAgentLab.Shared.Interaction;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;

namespace MarketingAnalyticsAgentLab.AgentRuntime.Endpoints;

public static class WorkflowEndpoints
{
    private static readonly ActivitySource ActivitySource = new("MarketingAnalyticsAgentLab.Workflows");

    public sealed record WorkflowRunRequest(string Message);

    public sealed record WorkflowStepResult(
        string AgentName,
        string Input,
        string Response,
        IReadOnlyList<AssistantToolCall> ToolCalls,
        int DurationMs);

    public sealed record WorkflowRunResponse(
        string WorkflowName,
        IReadOnlyList<WorkflowStepResult> Steps,
        string FinalResponse,
        int TotalDurationMs,
        string? Error);

    public sealed record WorkflowDefinitionDto(
        string Name,
        string DisplayName,
        string Description,
        IReadOnlyList<string> AgentNames);

    public static IEndpointRouteBuilder MapWorkflowEndpoints(this IEndpointRouteBuilder app)
    {
        var workflows = app.MapGroup("/workflows").WithTags("Workflows");

        // List the registered workflows. The Admin Portal calls this once on page load
        // and renders one card per workflow.
        workflows.MapGet("/", (WorkflowCatalog catalog) =>
        {
            return catalog.List().Select(w => new WorkflowDefinitionDto(
                Name: w.Name,
                DisplayName: w.DisplayName,
                Description: w.Description,
                AgentNames: w.AgentNames));
        })
        .WithName("ListWorkflows")
        .WithSummary("List registered multi-agent workflows.");

        // Run a workflow end-to-end. Each step is an independent AIAgent.RunStreamingAsync
        // call; the response of step N becomes the input of step N+1. Tool calls per step
        // are captured the same way the single-agent /agents/{name}/run endpoint does, so
        // the Admin Portal can render the hand-off chain.
        workflows.MapPost("/{name}/run", async (
            WorkflowCatalog catalog,
            RuntimeAgentRegistry registry,
            string name,
            WorkflowRunRequest request,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request?.Message))
            {
                return Results.BadRequest(new { error = "message is required." });
            }

            var workflow = catalog.Get(name);
            if (workflow is null)
            {
                return Results.NotFound(new { error = $"Workflow '{name}' is not registered." });
            }

            // Wrap the whole run in one Activity so the OTel trace tree shows
            // "workflow.run.CampaignInsightsWorkflow" as the parent of each agent run.
            using var span = ActivitySource.StartActivity("workflow.run", ActivityKind.Server);
            span?.SetTag("workflow.name", workflow.Name);
            span?.SetTag("workflow.agents", string.Join(",", workflow.AgentNames));

            var totalSw = Stopwatch.StartNew();
            var steps = new List<WorkflowStepResult>();
            var currentInput = request.Message;
            string? error = null;

            try
            {
                foreach (var agentName in workflow.AgentNames)
                {
                    if (!registry.TryGet(agentName, out var agent) || agent is null)
                    {
                        error =
                            $"Workflow agent '{agentName}' is not loaded by the AgentRuntime. " +
                            "Ensure PluginRegistry is reachable and the agent has its plugins attached.";
                        break;
                    }

                    var step = await RunAgentStepAsync(registry, agent, agentName, currentInput, ct);
                    steps.Add(step);
                    currentInput = step.Response;
                }
            }
            catch (Exception ex)
            {
                error = ex.Message;
            }

            totalSw.Stop();
            var finalResponse = steps.LastOrDefault()?.Response ?? string.Empty;
            return Results.Ok(new WorkflowRunResponse(
                WorkflowName: workflow.Name,
                Steps: steps,
                FinalResponse: finalResponse,
                TotalDurationMs: (int)totalSw.ElapsedMilliseconds,
                Error: error));
        })
        .WithName("RunWorkflow")
        .WithSummary("Run a multi-agent workflow end-to-end. Returns per-step output (response + tool calls) and a final composed answer.");

        return app;
    }

    /// <summary>
    /// Runs one agent in the chain and captures its response text + tool calls. This is
    /// the same shape AgentRunEndpoints uses for single-agent runs, narrowed to what the
    /// workflow surface needs (no token accounting today — that lives on the per-agent
    /// run endpoint).
    /// </summary>
    private static async Task<WorkflowStepResult> RunAgentStepAsync(
        RuntimeAgentRegistry registry,
        AIAgent agent,
        string agentName,
        string input,
        CancellationToken ct)
    {
        var toolMetadata = registry.GetToolMetadata(agentName);
        var collected = new List<AssistantToolCall>();
        var argsByCallId = new Dictionary<string, (string Tool, string ArgsJson, long StartedAtMs)>();
        var text = new StringBuilder();
        var stepSw = Stopwatch.StartNew();

        await foreach (var update in agent.RunStreamingAsync(input, cancellationToken: ct))
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
                        argsByCallId[call.CallId] = (call.Name, argsJson ?? "{}", stepSw.ElapsedMilliseconds);
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
                                DurationMs: (int)(stepSw.ElapsedMilliseconds - meta.StartedAtMs),
                                SourceMethod: endpoint?.Method,
                                SourcePath: endpoint?.Path,
                                Status: status));
                        }
                        break;
                }
            }
        }

        stepSw.Stop();
        return new WorkflowStepResult(
            AgentName: agentName,
            Input: input,
            Response: text.ToString(),
            ToolCalls: collected,
            DurationMs: (int)stepSw.ElapsedMilliseconds);
    }

    private static string ClassifyToolResult(string? resultPreview)
    {
        if (string.IsNullOrEmpty(resultPreview)) return "succeeded";
        if (resultPreview.Contains("policy.denied", StringComparison.OrdinalIgnoreCase)) return "denied";
        if (resultPreview.StartsWith("{\"error\"", StringComparison.OrdinalIgnoreCase)) return "failed";
        return "succeeded";
    }
}
