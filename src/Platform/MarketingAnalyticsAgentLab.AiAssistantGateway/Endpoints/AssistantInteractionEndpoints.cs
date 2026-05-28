using System.Diagnostics;
using System.Text.Json;
using MarketingAnalyticsAgentLab.AiAssistantGateway.Clients;
using MarketingAnalyticsAgentLab.RuntimeTelemetry;
using MarketingAnalyticsAgentLab.RuntimeTelemetry.Contracts;
using MarketingAnalyticsAgentLab.ServiceDefaults;
using MarketingAnalyticsAgentLab.Shared.Abstractions;
using MarketingAnalyticsAgentLab.Shared.Agents;
using MarketingAnalyticsAgentLab.Shared.Interaction;

namespace MarketingAnalyticsAgentLab.AiAssistantGateway.Endpoints;

public static class AssistantInteractionEndpoints
{
    /// <summary>
    /// Activity source for explicit Gateway spans. Registered with OpenTelemetry via
    /// <see cref="Extensions.PlatformActivitySource"/> so traces flow into the Aspire
    /// dashboard and the AgentRuntime's DevUI trace viewer.
    /// </summary>
    private static readonly ActivitySource ActivitySource = new(Extensions.PlatformActivitySource);

    public static IEndpointRouteBuilder MapAssistantInteractionEndpoints(this IEndpointRouteBuilder app)
    {
        // The single Atlas-style endpoint. All standalone apps (Marketing now, Fleet later)
        // call this same URL with a different assistantId.
        app.MapPost("/assistant/api/interaction/message", HandleAsync)
            .WithName("AssistantInteractionMessage")
            .WithSummary("Atlas-style interaction. Validates assistantId, routes to an agent, and returns the response with selected agent + tool calls.")
            .WithTags("Assistant");

        // Convenience for the Admin Portal / FakeAtlas to discover what assistants are routable.
        app.MapGet("/assistants", async (IAssistantRegistryClient assistantRegistry, CancellationToken ct) =>
            (await assistantRegistry.ListAssistantsAsync(ct)).Where(a => a.Enabled))
            .WithName("ListEnabledAssistants")
            .WithTags("Assistant");

        return app;
    }

    private static async Task<IResult> HandleAsync(
        AssistantInteractionRequest request,
        IAssistantRegistryClient assistantRegistry,
        IAgentRuntimeClient runtime,
        IAgentRouter router,
        IExecutionEventStore telemetry,
        ILogger<AgentRunResponse> logger,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.AssistantId))
        {
            return Results.BadRequest(new { error = "assistantId is required." });
        }
        if (string.IsNullOrWhiteSpace(request.Message))
        {
            return Results.BadRequest(new { error = "message is required." });
        }

        var conversationId = string.IsNullOrWhiteSpace(request.ConversationId)
            ? Guid.NewGuid().ToString()
            : request.ConversationId;

        // executionId is the join key that ties Gateway/Runtime/MCP spans + DB rows together.
        // Generated here so even early-validation rejections (assistant not found) get an
        // execution row that the dashboard can render.
        var executionId = Guid.NewGuid().ToString("N");
        var startedAt = DateTimeOffset.UtcNow;
        var stopwatch = Stopwatch.StartNew();

        using var interaction = ActivitySource.StartActivity("AssistantInteraction", ActivityKind.Server);
        interaction?.SetTag("assistant.id", request.AssistantId);
        interaction?.SetTag("assistant.tenant_id", request.TenantId);
        interaction?.SetTag("conversation.id", conversationId);
        interaction?.SetTag("execution.id", executionId);

        // Helper closure that records one telemetry row regardless of which branch we
        // exit from. Always called once per interaction so the dashboard sees blocked /
        // not-found cases too, not just the happy path.
        async Task PersistAsync(
            string application,
            string agentId,
            string status,
            string permissionResult,
            string? blockedReason,
            string? routerReason,
            AgentRunResponse? run)
        {
            stopwatch.Stop();
            var totalLatency = (int)stopwatch.ElapsedMilliseconds;
            var record = new RecordExecutionRequest(
                ExecutionId: executionId,
                Timestamp: startedAt,
                TenantId: string.IsNullOrWhiteSpace(request.TenantId) ? "(unknown)" : request.TenantId,
                UserId: request.Context?.UserId,
                Application: string.IsNullOrWhiteSpace(application) ? "(unknown)" : application,
                AssistantId: request.AssistantId,
                AgentId: agentId,
                Model: run?.Model ?? string.Empty,
                InputTokens: run?.InputTokens ?? 0,
                OutputTokens: run?.OutputTokens ?? 0,
                LatencyMs: run?.LatencyMs ?? totalLatency,
                Status: status,
                RouterReason: routerReason,
                TraceId: Activity.Current?.Id,
                PermissionResult: permissionResult,
                SensitiveFieldsFiltered: 0,
                ApprovalRequired: false,
                BlockedReason: blockedReason,
                ToolCalls: BuildToolCallRows(run));
            await telemetry.RecordAsync(record, ct).ConfigureAwait(false);
        }

        AssistantDefinitionLookup assistantLookup;
        using (ActivitySource.StartActivity("AssistantRegistry.Resolve", ActivityKind.Client))
        {
            var assistant = await assistantRegistry.GetAssistantAsync(request.AssistantId, ct);
            if (assistant is null)
            {
                interaction?.SetStatus(ActivityStatusCode.Error, "assistant.not_found");
                await PersistAsync("(unknown)", "(unresolved)", "blocked", "denied",
                    blockedReason: "assistant-not-found", routerReason: null, run: null);
                return Results.NotFound(new { error = $"Assistant '{request.AssistantId}' not found.", executionId });
            }
            if (!assistant.Enabled)
            {
                interaction?.SetStatus(ActivityStatusCode.Error, "assistant.disabled");
                await PersistAsync(assistant.Application, "(unresolved)", "blocked", "denied",
                    blockedReason: "assistant-disabled", routerReason: null, run: null);
                return Results.Json(
                    new { error = $"Assistant '{request.AssistantId}' is registered but not yet enabled.", application = assistant.Application, executionId },
                    statusCode: 409);
            }
            interaction?.SetTag("assistant.application", assistant.Application);

            // Candidate set = simple YAML agents (from PluginRegistry) + composite
            // agents (live in agent-runtime, backed by published Elsa workflows). The
            // assistant's AgentNames may list either kind; we synthesize a minimal
            // AgentDefinition for composites so the existing IAgentRouter keeps a
            // single uniform input type and the dispatch path downstream is unchanged.
            // Composite agents have no PluginIds / ModelDeployment / Instructions at this
            // layer — those are owned by the workflow definition inside agent-runtime.
            var simpleAgents = await assistantRegistry.ListAgentsAsync(ct);
            var liveAgents = await runtime.ListAgentsAsync(ct);
            var compositeAsDefs = liveAgents
                .Where(a => a.Kind == AgentKind.Composite)
                .Select(a => new AgentDefinition(
                    Id: Guid.Empty,
                    Name: a.Name,
                    DisplayName: a.DisplayName,
                    Description: a.Description,
                    Instructions: string.Empty,
                    ModelDeployment: string.Empty,
                    PluginIds: Array.Empty<Guid>(),
                    RoutingHints: null));
            var allAgents = simpleAgents.Concat(compositeAsDefs).ToArray();
            var candidateNames = new HashSet<string>(assistant.AgentNames, StringComparer.OrdinalIgnoreCase);
            var candidates = allAgents.Where(a => candidateNames.Contains(a.Name)).ToArray();
            if (candidates.Length == 0)
            {
                interaction?.SetStatus(ActivityStatusCode.Error, "assistant.no_candidates");
                await PersistAsync(assistant.Application, "(unresolved)", "failed", "allowed",
                    blockedReason: null, routerReason: null, run: null);
                return Results.Problem(
                    title: "No candidate agents for assistant.",
                    detail: $"Assistant '{assistant.AssistantId}' does not reference any registered agents.",
                    statusCode: 503);
            }
            assistantLookup = new AssistantDefinitionLookup(assistant, candidates);
        }

        // Resolve the agent BEFORE invoking the runtime. The runtime only ever executes a
        // fully-resolved request, which keeps the runtime simple and the platform's routing
        // policy testable in isolation.
        ResolvedAgent resolved;
        using (var routing = ActivitySource.StartActivity("AgentRouter.Resolve", ActivityKind.Internal))
        {
            resolved = await router.SelectAsync(request, assistantLookup.Assistant, assistantLookup.Candidates, ct);
            routing?.SetTag("agent.name", resolved.AgentName);
            routing?.SetTag("agent.router_reason", resolved.Reason);
        }
        interaction?.SetTag("agent.name", resolved.AgentName);

        var runRequest = new AgentRunRequest(
            Message: request.Message,
            ConversationId: conversationId,
            TenantId: request.TenantId,
            ContextJson: request.Context is null ? null : JsonSerializer.Serialize(request.Context),
            ExecutionId: executionId);

        AgentRunResponse run;
        using (var execution = ActivitySource.StartActivity("AgentRuntime.Execute", ActivityKind.Client))
        {
            execution?.SetTag("agent.name", resolved.AgentName);
            execution?.SetTag("execution.id", executionId);
            try
            {
                run = await runtime.RunAsync(resolved.AgentName, runRequest, ct);
                execution?.SetTag("tool_calls.count", run.ToolCalls.Count);
                execution?.SetTag("tokens.input",  run.InputTokens);
                execution?.SetTag("tokens.output", run.OutputTokens);
                execution?.SetTag("model.id",      run.Model);
            }
            catch (HttpRequestException ex)
            {
                execution?.SetStatus(ActivityStatusCode.Error, ex.Message);
                logger.LogError(ex, "AgentRuntime call failed for assistant {AssistantId} / resolved agent {AgentName}",
                    request.AssistantId, resolved.AgentName);
                await PersistAsync(assistantLookup.Assistant.Application, resolved.AgentName, "failed", "allowed",
                    blockedReason: null, routerReason: resolved.Reason, run: null);
                return Results.Problem(
                    title: "AgentRuntime call failed.",
                    detail: ex.Message,
                    statusCode: 502);
            }
        }

        // Final outcome classification. Coarse, on purpose: the dashboard summarises in three
        // buckets (succeeded / failed / blocked); fine-grained reasons live in tool-call
        // rows + blocked_reason.
        var status = ClassifyOutcome(run);
        await PersistAsync(assistantLookup.Assistant.Application, resolved.AgentName, status, "allowed",
            blockedReason: null, routerReason: resolved.Reason, run: run);

        var response = new AssistantInteractionResponse(
            ConversationId: conversationId,
            AssistantId: request.AssistantId,
            SelectedAgent: resolved.AgentName,
            Message: run.Message,
            ToolCalls: run.ToolCalls,
            RouterReason: resolved.Reason,
            TraceId: Activity.Current?.Id,
            ExecutionId: executionId,
            Model: run.Model,
            InputTokens: run.InputTokens,
            OutputTokens: run.OutputTokens);

        return Results.Ok(response);
    }

    private static IReadOnlyList<RecordToolCallRequest> BuildToolCallRows(AgentRunResponse? run)
    {
        if (run is null || run.ToolCalls.Count == 0) return Array.Empty<RecordToolCallRequest>();

        var rows = new List<RecordToolCallRequest>(run.ToolCalls.Count);
        for (var i = 0; i < run.ToolCalls.Count; i++)
        {
            var tc = run.ToolCalls[i];
            rows.Add(new RecordToolCallRequest(
                Sequence: i,
                ToolName: tc.Tool,
                PluginName: tc.Plugin,
                SourceMethod: tc.SourceMethod ?? string.Empty,
                SourcePath: tc.SourcePath ?? string.Empty,
                LatencyMs: tc.DurationMs ?? 0,
                Status: string.IsNullOrEmpty(tc.Status) ? "succeeded" : tc.Status));
        }
        return rows;
    }

    /// <summary>
    /// Maps an <see cref="AgentRunResponse"/> to the three dashboard buckets. Any denied
    /// tool call short-circuits to <c>blocked</c>; any failed tool call to <c>failed</c>.
    /// </summary>
    private static string ClassifyOutcome(AgentRunResponse run)
    {
        if (run.ToolCalls.Any(t => string.Equals(t.Status, "denied", StringComparison.OrdinalIgnoreCase)))
        {
            return "blocked";
        }
        if (run.ToolCalls.Any(t => string.Equals(t.Status, "failed", StringComparison.OrdinalIgnoreCase)))
        {
            return "failed";
        }
        return "succeeded";
    }

    private sealed record AssistantDefinitionLookup(
        Shared.Assistants.AssistantDefinition Assistant,
        IReadOnlyList<Shared.Agents.AgentDefinition> Candidates);
}
