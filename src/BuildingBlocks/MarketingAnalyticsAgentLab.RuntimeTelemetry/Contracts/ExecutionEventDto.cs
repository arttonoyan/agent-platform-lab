namespace MarketingAnalyticsAgentLab.RuntimeTelemetry.Contracts;

/// <summary>
/// JSON DTO returned by <c>GET /telemetry/events</c>. Shape mirrors the
/// <c>ExecutionEvent</c> interface in the Admin Portal's <c>runtimeEvents.ts</c>; do not
/// rename fields without updating the frontend type at the same time.
/// </summary>
public sealed record ExecutionEventDto(
    string ExecutionId,
    DateTimeOffset Timestamp,
    string TenantId,
    string? UserId,
    string Application,
    string AssistantId,
    string AgentId,
    string Model,
    int InputTokens,
    int OutputTokens,
    decimal EstimatedCost,
    int LatencyMs,
    string Status,
    IReadOnlyList<ExecutionToolCallDto> ToolCalls,
    PolicyResultDto Policy,
    string? RouterReason,
    string? TraceId);

public sealed record ExecutionToolCallDto(
    string ToolName,
    string SourceMethod,
    string SourcePath,
    int LatencyMs,
    string Status);

public sealed record PolicyResultDto(
    string PermissionResult,
    int SensitiveFieldsFiltered,
    bool ApprovalRequired,
    string? BlockedReason);

/// <summary>
/// Input contract used by the Gateway to ask the telemetry store to persist a row.
/// The store handles cost calculation; callers only supply raw token counts.
/// </summary>
public sealed record RecordExecutionRequest(
    string ExecutionId,
    DateTimeOffset Timestamp,
    string TenantId,
    string? UserId,
    string Application,
    string AssistantId,
    string AgentId,
    string Model,
    int InputTokens,
    int OutputTokens,
    int LatencyMs,
    string Status,
    string? RouterReason,
    string? TraceId,
    string PermissionResult,
    int SensitiveFieldsFiltered,
    bool ApprovalRequired,
    string? BlockedReason,
    IReadOnlyList<RecordToolCallRequest> ToolCalls);

public sealed record RecordToolCallRequest(
    int Sequence,
    string ToolName,
    string PluginName,
    string SourceMethod,
    string SourcePath,
    int LatencyMs,
    string Status);
