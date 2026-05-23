using System.Collections.Concurrent;
using MarketingAnalyticsAgentLab.Shared.Abstractions;
using Microsoft.Agents.AI;

namespace MarketingAnalyticsAgentLab.AgentRuntime.Agents;

/// <summary>
/// Hot cache of live <see cref="AIAgent"/> instances composed from declarative
/// <c>AgentDefinition</c>s. The Gateway hands the runtime a fully-resolved agent name
/// (see <c>ResolvedAgent</c> in the Shared library); the runtime looks the live agent up
/// here and executes it. <see cref="AgentLifecycleService"/> rebuilds entries on every
/// relevant registry event (agent changed, plugin published/unpublished).
/// </summary>
public sealed class RuntimeAgentRegistry : IAgentRegistry
{
    private readonly ConcurrentDictionary<string, RegisteredAgent> _agents = new(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyList<AgentDescriptor> List()
        => _agents.Values.Select(a => a.Descriptor).ToArray();

    public AgentDescriptor? Find(string name)
        => _agents.TryGetValue(name, out var a) ? a.Descriptor : null;

    public bool TryGet(string name, out AIAgent? agent)
    {
        if (_agents.TryGetValue(name, out var a))
        {
            agent = a.Agent;
            return true;
        }
        agent = null;
        return false;
    }

    public IReadOnlyDictionary<string, string> GetToolToPluginMap(string agentName)
        => _agents.TryGetValue(agentName, out var a) ? a.ToolToPlugin : new Dictionary<string, string>();

    public void Replace(string name, AgentDescriptor descriptor, AIAgent agent, IReadOnlyDictionary<string, string> toolToPlugin)
        => _agents[name] = new RegisteredAgent(descriptor, agent, toolToPlugin);

    public void Clear() => _agents.Clear();

    private sealed record RegisteredAgent(
        AgentDescriptor Descriptor,
        AIAgent Agent,
        IReadOnlyDictionary<string, string> ToolToPlugin);
}
