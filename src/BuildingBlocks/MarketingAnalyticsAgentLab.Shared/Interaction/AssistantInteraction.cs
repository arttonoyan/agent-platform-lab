using MarketingAnalyticsAgentLab.Shared.Agents;
using MarketingAnalyticsAgentLab.Shared.Assistants;

namespace MarketingAnalyticsAgentLab.Shared.Interaction;

/// <summary>
/// Wire contract for <c>POST /assistant/api/interaction/message</c> - the single endpoint
/// Atlas (and the FakeAtlasApp demo client) call.
/// </summary>
public sealed record AssistantInteractionRequest(
    string AssistantId,
    string TenantId,
    string Message,
    string ConversationId,
    AssistantInteractionContext? Context);

public sealed record AssistantInteractionContext(
    string? Application,
    string? Page,
    string? UserId,
    IReadOnlyDictionary<string, string>? Extras);

public sealed record AssistantToolCall(
    string Plugin,
    string Tool,
    string? ArgumentsJson,
    string? ResultPreview,
    int? DurationMs);

public sealed record AssistantInteractionResponse(
    string ConversationId,
    string AssistantId,
    string SelectedAgent,
    string Message,
    IReadOnlyList<AssistantToolCall> ToolCalls,
    string? RouterReason,
    string? TraceId);

/// <summary>
/// Internal contract between Gateway → AgentRuntime. The runtime returns the final message
/// plus the captured tool-call log with plugin attribution.
/// </summary>
public sealed record AgentRunRequest(
    string Message,
    string ConversationId,
    string TenantId,
    string? ContextJson);

public sealed record AgentRunResponse(
    string Message,
    IReadOnlyList<AssistantToolCall> ToolCalls);

/// <summary>
/// Outcome of the <see cref="IAgentRouter"/>: which agent in the assistant's pool will execute
/// this interaction. The Gateway carries the resolved agent name back to the caller in the
/// <c>selectedAgent</c> field of the response so clients can render which agent answered.
/// </summary>
public sealed record ResolvedAgent(string AgentName, string Reason);

/// <summary>
/// Routes one interaction to one agent. Routing happens in the Gateway, BEFORE the agent
/// runtime is invoked, so the runtime only ever executes a fully-resolved request. Default
/// implementation is rule-based; an LLM-classifier router can be swapped in via DI.
/// </summary>
public interface IAgentRouter
{
    Task<ResolvedAgent> SelectAsync(
        AssistantInteractionRequest request,
        AssistantDefinition assistant,
        IReadOnlyList<AgentDefinition> candidates,
        CancellationToken cancellationToken);
}
