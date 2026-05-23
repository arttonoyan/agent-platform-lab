namespace MarketingAnalyticsAgentLab.Shared.Abstractions;

/// <summary>
/// Identifying metadata for an agent. Implementations live in the Agent Runtime and wrap
/// concrete <c>AIAgent</c> instances; the registry abstraction is exposed here so other
/// services (e.g. the AI Assistant Gateway, governance UI, or workflow engine) can enumerate
/// available agents without taking a hard dependency on Microsoft.Agents.AI.
/// </summary>
public sealed record AgentDescriptor(
    string Name,
    string DisplayName,
    string Description,
    IReadOnlyList<string> Plugins,
    IReadOnlyList<string> Tools);

public interface IAgentRegistry
{
    IReadOnlyList<AgentDescriptor> List();
    AgentDescriptor? Find(string name);
}
