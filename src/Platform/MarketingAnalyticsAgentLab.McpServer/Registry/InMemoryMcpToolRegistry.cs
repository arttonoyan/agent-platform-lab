using System.Collections.Concurrent;
using MarketingAnalyticsAgentLab.Shared.Abstractions;

namespace MarketingAnalyticsAgentLab.McpServer.Registry;

/// <summary>
/// Mirrors the currently-loaded plugin tools so AdminPortal can list "what is live in MCP".
/// Populated by <see cref="DynamicPluginToolHost"/> whenever it (re)loads published plugins.
/// </summary>
public sealed class InMemoryMcpToolRegistry : IMcpToolRegistry
{
    private readonly ConcurrentDictionary<string, McpToolDescriptor> _tools = new(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyList<McpToolDescriptor> List() => _tools.Values.ToArray();

    public IReadOnlyList<McpToolDescriptor> ListByPlugin(string pluginName)
        => _tools.Values.Where(t => string.Equals(t.PluginName, pluginName, StringComparison.OrdinalIgnoreCase)).ToArray();

    public void Register(McpToolDescriptor descriptor) => _tools[descriptor.Name] = descriptor;

    public void Remove(string toolName) => _tools.TryRemove(toolName, out _);
}
