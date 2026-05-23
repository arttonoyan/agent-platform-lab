namespace MarketingAnalyticsAgentLab.Shared.Assistants;

/// <summary>
/// An <c>Assistant</c> is the platform identity that standalone-app clients (Atlas-style)
/// address through the AI Assistant Gateway. One assistant fronts a curated pool of agents
/// that the gateway router picks between per request. Each standalone application (Marketing
/// today, Fleet later) has its own assistant id so the centralized gateway can serve many
/// apps without changing its surface.
/// </summary>
public sealed record AssistantDefinition(
    string AssistantId,
    string DisplayName,
    string Application,
    string Description,
    IReadOnlyList<string> AgentNames,
    string? DefaultAgentName,
    string? SystemPreamble,
    bool Enabled);

/// <summary>
/// Platform registry of <see cref="AssistantDefinition"/>s. The Gateway loads from it on
/// every incoming interaction request; the Admin Portal writes to it through the
/// Plugin Registry service.
/// </summary>
public interface IAssistantRegistry
{
    Task<IReadOnlyList<AssistantDefinition>> ListAsync(CancellationToken ct);
    Task<AssistantDefinition?> GetAsync(string assistantId, CancellationToken ct);
    Task<AssistantDefinition> SaveAsync(AssistantDefinition assistant, CancellationToken ct);
    Task DeleteAsync(string assistantId, CancellationToken ct);
}
