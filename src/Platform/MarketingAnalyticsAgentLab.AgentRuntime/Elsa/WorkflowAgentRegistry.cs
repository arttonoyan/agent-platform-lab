using System.Collections.Concurrent;
using MarketingAnalyticsAgentLab.Shared.Abstractions;

namespace MarketingAnalyticsAgentLab.AgentRuntime.Elsa;

/// <summary>
/// In-memory cache of agents that are backed by published Elsa workflows. Mirrors the
/// role <c>RuntimeAgentRegistry</c> plays for simple (single-LLM) agents but stores the
/// workflow's logical id alongside the descriptor so the dispatch path can hand off to
/// <see cref="Elsa.Workflows.Runtime.IWorkflowInvoker"/>.
///
/// Composite agents are discovered and refreshed by
/// <see cref="WorkflowAgentBridge"/> — engineers don't enrol them manually.
/// </summary>
public sealed class WorkflowAgentRegistry
{
    private readonly ConcurrentDictionary<string, RegisteredWorkflowAgent> _agents = new(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyList<AgentDescriptor> List() => _agents.Values.Select(a => a.Descriptor).ToArray();

    public AgentDescriptor? Find(string name) => _agents.TryGetValue(name, out var a) ? a.Descriptor : null;

    public bool TryGetWorkflowDefinitionId(string name, out string? definitionId)
    {
        if (_agents.TryGetValue(name, out var a))
        {
            definitionId = a.WorkflowDefinitionId;
            return true;
        }
        definitionId = null;
        return false;
    }

    /// <summary>
    /// Replace the cache with the snapshot supplied by <see cref="WorkflowAgentBridge"/>.
    /// Done atomically so consumers don't observe a partially-populated registry between
    /// publishes.
    /// </summary>
    public void ReplaceAll(IEnumerable<(AgentDescriptor Descriptor, string WorkflowDefinitionId)> agents)
    {
        var next = new Dictionary<string, RegisteredWorkflowAgent>(StringComparer.OrdinalIgnoreCase);
        foreach (var (descriptor, defId) in agents)
        {
            next[descriptor.Name] = new RegisteredWorkflowAgent(descriptor, defId);
        }

        _agents.Clear();
        foreach (var entry in next)
        {
            _agents[entry.Key] = entry.Value;
        }
    }

    private sealed record RegisteredWorkflowAgent(AgentDescriptor Descriptor, string WorkflowDefinitionId);
}
