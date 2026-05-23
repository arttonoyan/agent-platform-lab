namespace MarketingAnalyticsAgentLab.Shared.Abstractions;

/// <summary>
/// Placeholder for future workflow persistence (checkpointing, replay, durable tasks).
/// The current POC keeps state in memory only.
/// </summary>
public interface IWorkflowStore
{
    Task SaveCheckpointAsync(string workflowId, string state, CancellationToken ct);
    Task<string?> LoadCheckpointAsync(string workflowId, CancellationToken ct);
}
