using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MarketingAnalyticsAgentLab.RuntimeTelemetry.Models;

/// <summary>
/// Persistence row for one end-to-end agent interaction. One row per call to the
/// AI Gateway's <c>POST /assistant/api/interaction/message</c>. Child <see cref="ToolCallRow"/>s
/// reference this row via <see cref="ExecutionId"/>.
///
/// This is the system of record behind the Admin Portal's AI Runtime Dashboard. The
/// shape mirrors the frontend's <c>ExecutionEvent</c> contract so the dashboard can render
/// directly from the rows the Gateway persists.
/// </summary>
[Table("execution_events")]
public sealed class ExecutionEventRow
{
    /// <summary>Stable identifier the Gateway generates on request entry. Propagated to
    /// downstream services (AgentRuntime, McpServer) for span correlation.</summary>
    [Key]
    [Column("execution_id")]
    [MaxLength(64)]
    public required string ExecutionId { get; set; }

    [Column("timestamp")]
    public required DateTimeOffset Timestamp { get; set; }

    [Column("tenant_id")]
    [MaxLength(128)]
    public required string TenantId { get; set; }

    [Column("user_id")]
    [MaxLength(128)]
    public string? UserId { get; set; }

    /// <summary>Calling product family (marketing / fleet / fieldops / ...). Resolved from
    /// the <c>AssistantDefinition.Application</c> field looked up at request time.</summary>
    [Column("application")]
    [MaxLength(64)]
    public required string Application { get; set; }

    [Column("assistant_id")]
    [MaxLength(128)]
    public required string AssistantId { get; set; }

    /// <summary>Resolved agent name (e.g. <c>CampaignOptimizationAgent</c>). Mirrors the
    /// router output, not the agent definition GUID.</summary>
    [Column("agent_id")]
    [MaxLength(128)]
    public required string AgentId { get; set; }

    /// <summary>Model id captured at chat-client level (e.g. <c>gpt-4o-mini</c>). Empty when
    /// the run was blocked before the model was invoked.</summary>
    [Column("model")]
    [MaxLength(128)]
    public string Model { get; set; } = string.Empty;

    [Column("input_tokens")]
    public int InputTokens { get; set; }

    [Column("output_tokens")]
    public int OutputTokens { get; set; }

    /// <summary>Server-computed estimated USD using the active token pricing table. Persisted
    /// so historical rows survive a pricing update.</summary>
    [Column("estimated_cost")]
    public decimal EstimatedCost { get; set; }

    [Column("latency_ms")]
    public int LatencyMs { get; set; }

    /// <summary>Coarse outcome: <c>succeeded</c> / <c>failed</c> / <c>blocked</c>. Derived at the Gateway
    /// from the runtime response + policy result so the dashboard does not have to interpret
    /// nuanced sub-states.</summary>
    [Column("status")]
    [MaxLength(32)]
    public required string Status { get; set; }

    [Column("permission_result")]
    [MaxLength(32)]
    public string PermissionResult { get; set; } = "allowed";

    [Column("sensitive_fields_filtered")]
    public int SensitiveFieldsFiltered { get; set; }

    [Column("approval_required")]
    public bool ApprovalRequired { get; set; }

    /// <summary>Set when status = blocked or permission_result = denied. Free-form so new
    /// policy categories can be added without a schema migration.</summary>
    [Column("blocked_reason")]
    [MaxLength(128)]
    public string? BlockedReason { get; set; }

    [Column("router_reason")]
    [MaxLength(256)]
    public string? RouterReason { get; set; }

    [Column("trace_id")]
    [MaxLength(64)]
    public string? TraceId { get; set; }

    public List<ToolCallRow> ToolCalls { get; set; } = new();
}
