using System.Collections.Concurrent;

namespace MarketingAnalyticsAgentLab.McpServer.Registry;

/// <summary>
/// Records a bounded, in-memory window of recent tool executions so the AdminPortal's
/// Activity / Executions page can show "what just ran" without a full tracing stack.
///
/// Bounded because the demo runs without an external store: every <see cref="DynamicTools.PluginAIFunction"/>
/// invocation appends a record, the buffer trims to <see cref="Capacity"/>, and reads
/// snapshot newest-first. When a real execution-trace pipeline lands later, the page can
/// switch to that source without touching the UI shape.
/// </summary>
public sealed class ExecutionLog
{
    public const int Capacity = 200;

    private readonly ConcurrentQueue<ToolExecutionRecord> _records = new();

    public void Record(ToolExecutionRecord record)
    {
        _records.Enqueue(record);
        while (_records.Count > Capacity && _records.TryDequeue(out _))
        {
            // trim oldest
        }
    }

    public IReadOnlyList<ToolExecutionRecord> Snapshot(int limit)
    {
        if (limit <= 0) limit = Capacity;
        return _records
            .ToArray()
            .Reverse()
            .Take(limit)
            .ToArray();
    }
}

/// <summary>
/// One tool invocation through MCP (live agent or DevUI). Captures just enough to render
/// the Executions list without leaking arbitrarily-large payloads: arguments / result
/// previews are truncated by the writer.
/// </summary>
public sealed record ToolExecutionRecord(
    string Id,
    DateTimeOffset OccurredAt,
    string ToolName,
    string PluginName,
    string Method,
    string Path,
    string? AgentName,
    string ArgumentsPreview,
    string ResultPreview,
    int StatusCode,
    int DurationMs,
    string Status,
    string? Error);
