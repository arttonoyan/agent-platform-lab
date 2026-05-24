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

/// <summary>
/// Tool call captured during an agent run. The original LLM-visible <see cref="Tool"/>
/// name + plugin attribution is augmented with the underlying OpenAPI source endpoint
/// (<see cref="SourceMethod"/> + <see cref="SourcePath"/>) and an outcome (<see cref="Status"/>)
/// so the AI Runtime Dashboard can render "tool calls by tool" and "tool calls by
/// endpoint" breakdowns from a single feed without a second lookup.
/// </summary>
public sealed record AssistantToolCall(
    string Plugin,
    string Tool,
    string? ArgumentsJson,
    string? ResultPreview,
    int? DurationMs,
    string? SourceMethod = null,
    string? SourcePath = null,
    string Status = "succeeded");

public sealed record AssistantInteractionResponse(
    string ConversationId,
    string AssistantId,
    string SelectedAgent,
    string Message,
    IReadOnlyList<AssistantToolCall> ToolCalls,
    string? RouterReason,
    string? TraceId,
    /// <summary>Stable id the Gateway generated for this interaction. Survives downstream
    /// systems and is the join key into the runtime telemetry store.</summary>
    string? ExecutionId = null,
    /// <summary>Model id reported by the chat client that ran this interaction
    /// (e.g. <c>gpt-4o-mini</c>). Empty when blocked before the model was invoked.</summary>
    string? Model = null,
    int InputTokens = 0,
    int OutputTokens = 0);

/// <summary>
/// Internal contract between Gateway → AgentRuntime. The Gateway propagates the
/// <see cref="ExecutionId"/> so the runtime can stamp downstream spans + records with
/// the same correlation id. The runtime returns the final message + tool calls plus
/// the token usage it captured from the chat client.
/// </summary>
public sealed record AgentRunRequest(
    string Message,
    string ConversationId,
    string TenantId,
    string? ContextJson,
    string? ExecutionId = null);

public sealed record AgentRunResponse(
    string Message,
    IReadOnlyList<AssistantToolCall> ToolCalls,
    string Model = "",
    int InputTokens = 0,
    int OutputTokens = 0,
    int LatencyMs = 0);

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
