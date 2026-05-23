namespace MarketingAnalyticsAgentLab.Shared.Agents;

/// <summary>
/// Declarative description of a Microsoft Agent Framework agent. The AgentRuntime turns
/// these into live <c>AIAgent</c> instances by attaching MCP tools that come from the
/// referenced plugins.
/// </summary>
public sealed record AgentDefinition(
    Guid Id,
    string Name,
    string DisplayName,
    string Description,
    string Instructions,
    string ModelDeployment,
    IReadOnlyList<Guid> PluginIds,
    IReadOnlyList<string>? RoutingHints);

public interface IAgentDefinitionStore
{
    Task<IReadOnlyList<AgentDefinition>> ListAsync(CancellationToken ct);
    Task<AgentDefinition?> GetAsync(Guid id, CancellationToken ct);
    Task<AgentDefinition?> GetByNameAsync(string name, CancellationToken ct);
    Task<AgentDefinition> SaveAsync(AgentDefinition definition, CancellationToken ct);
    Task DeleteAsync(Guid id, CancellationToken ct);
}
