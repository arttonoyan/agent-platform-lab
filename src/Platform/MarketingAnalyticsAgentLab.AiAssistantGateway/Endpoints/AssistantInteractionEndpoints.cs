using System.Diagnostics;
using System.Text.Json;
using MarketingAnalyticsAgentLab.AiAssistantGateway.Clients;
using MarketingAnalyticsAgentLab.ServiceDefaults;
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

        using var interaction = ActivitySource.StartActivity("AssistantInteraction", ActivityKind.Server);
        interaction?.SetTag("assistant.id", request.AssistantId);
        interaction?.SetTag("assistant.tenant_id", request.TenantId);
        interaction?.SetTag("conversation.id", conversationId);

        AssistantDefinitionLookup assistantLookup;
        using (ActivitySource.StartActivity("AssistantRegistry.Resolve", ActivityKind.Client))
        {
            var assistant = await assistantRegistry.GetAssistantAsync(request.AssistantId, ct);
            if (assistant is null)
            {
                interaction?.SetStatus(ActivityStatusCode.Error, "assistant.not_found");
                return Results.NotFound(new { error = $"Assistant '{request.AssistantId}' not found." });
            }
            if (!assistant.Enabled)
            {
                interaction?.SetStatus(ActivityStatusCode.Error, "assistant.disabled");
                return Results.Json(
                    new { error = $"Assistant '{request.AssistantId}' is registered but not yet enabled.", application = assistant.Application },
                    statusCode: 409);
            }
            interaction?.SetTag("assistant.application", assistant.Application);

            var allAgents = await assistantRegistry.ListAgentsAsync(ct);
            var candidateNames = new HashSet<string>(assistant.AgentNames, StringComparer.OrdinalIgnoreCase);
            var candidates = allAgents.Where(a => candidateNames.Contains(a.Name)).ToArray();
            if (candidates.Length == 0)
            {
                interaction?.SetStatus(ActivityStatusCode.Error, "assistant.no_candidates");
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
            ContextJson: request.Context is null ? null : JsonSerializer.Serialize(request.Context));

        AgentRunResponse run;
        using (var execution = ActivitySource.StartActivity("AgentRuntime.Execute", ActivityKind.Client))
        {
            execution?.SetTag("agent.name", resolved.AgentName);
            try
            {
                run = await runtime.RunAsync(resolved.AgentName, runRequest, ct);
                execution?.SetTag("tool_calls.count", run.ToolCalls.Count);
            }
            catch (HttpRequestException ex)
            {
                execution?.SetStatus(ActivityStatusCode.Error, ex.Message);
                logger.LogError(ex, "AgentRuntime call failed for assistant {AssistantId} / resolved agent {AgentName}",
                    request.AssistantId, resolved.AgentName);
                return Results.Problem(
                    title: "AgentRuntime call failed.",
                    detail: ex.Message,
                    statusCode: 502);
            }
        }

        var response = new AssistantInteractionResponse(
            ConversationId: conversationId,
            AssistantId: request.AssistantId,
            SelectedAgent: resolved.AgentName,
            Message: run.Message,
            ToolCalls: run.ToolCalls,
            RouterReason: resolved.Reason,
            TraceId: Activity.Current?.Id);

        return Results.Ok(response);
    }

    private sealed record AssistantDefinitionLookup(
        Shared.Assistants.AssistantDefinition Assistant,
        IReadOnlyList<Shared.Agents.AgentDefinition> Candidates);
}
