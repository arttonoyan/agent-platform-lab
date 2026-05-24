using MarketingAnalyticsAgentLab.RuntimeTelemetry.Contracts;

namespace MarketingAnalyticsAgentLab.RuntimeTelemetry;

/// <summary>
/// Write + read seam used by the AI Gateway. Implementations persist one parent
/// <c>execution_events</c> row plus N child <c>execution_tool_calls</c> rows per call,
/// and expose simple query operations for the Admin Portal's dashboard.
/// </summary>
public interface IExecutionEventStore
{
    /// <summary>Inserts one execution + its child tool calls. Cost is computed inside
    /// the store using <c>ITokenPricing</c> so callers never have to know the price table.
    /// Failures are swallowed and logged — telemetry must never break the user's request.</summary>
    Task RecordAsync(RecordExecutionRequest request, CancellationToken cancellationToken);

    /// <summary>Returns the most recent <paramref name="limit"/> executions newest-first.
    /// Child tool calls are eager-loaded so the dashboard can render in a single round-trip.</summary>
    Task<IReadOnlyList<ExecutionEventDto>> ListRecentAsync(int limit, CancellationToken cancellationToken);

    /// <summary>Fetches one execution by id. Returns <c>null</c> when no row matches.</summary>
    Task<ExecutionEventDto?> GetAsync(string executionId, CancellationToken cancellationToken);
}
