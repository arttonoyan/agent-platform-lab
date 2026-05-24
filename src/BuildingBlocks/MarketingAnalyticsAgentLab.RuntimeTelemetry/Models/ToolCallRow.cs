using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MarketingAnalyticsAgentLab.RuntimeTelemetry.Models;

/// <summary>
/// One tool invocation that happened inside a parent <see cref="ExecutionEventRow"/>.
/// Captures the LLM-visible tool name and the underlying OpenAPI source endpoint so
/// the dashboard can answer both "which tools were called?" and "which source APIs
/// are we hitting?".
/// </summary>
[Table("execution_tool_calls")]
public sealed class ToolCallRow
{
    [Key]
    [Column("id")]
    public long Id { get; set; }

    [Column("execution_id")]
    [MaxLength(64)]
    public required string ExecutionId { get; set; }

    [ForeignKey(nameof(ExecutionId))]
    public ExecutionEventRow? Execution { get; set; }

    /// <summary>Position in the sequence of tool calls. Used by the dashboard to render
    /// tools in the order the agent invoked them.</summary>
    [Column("sequence")]
    public int Sequence { get; set; }

    [Column("tool_name")]
    [MaxLength(256)]
    public required string ToolName { get; set; }

    /// <summary>Display name of the originating Tool Set / Plugin. Useful for "tool calls
    /// by plugin" breakdowns later.</summary>
    [Column("plugin_name")]
    [MaxLength(256)]
    public string PluginName { get; set; } = string.Empty;

    /// <summary>HTTP method of the source endpoint template (GET / POST / ...).</summary>
    [Column("source_method")]
    [MaxLength(16)]
    public string SourceMethod { get; set; } = string.Empty;

    /// <summary>HTTP path template (e.g. <c>/campaigns/{id}/summary</c>) — NOT the
    /// concretised path with values substituted.</summary>
    [Column("source_path")]
    [MaxLength(512)]
    public string SourcePath { get; set; } = string.Empty;

    [Column("latency_ms")]
    public int LatencyMs { get; set; }

    /// <summary><c>succeeded</c> / <c>failed</c> / <c>denied</c>.</summary>
    [Column("status")]
    [MaxLength(32)]
    public required string Status { get; set; }
}
