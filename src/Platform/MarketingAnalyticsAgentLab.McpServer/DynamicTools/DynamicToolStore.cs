using System.Collections.Concurrent;
using ModelContextProtocol.Server;

namespace MarketingAnalyticsAgentLab.McpServer.DynamicTools;

/// <summary>
/// Holds the currently-active set of plugin-derived MCP tools. The list/call handlers
/// registered on the MCP server read from this store, and the
/// <see cref="DynamicPluginToolHost"/> background service rebuilds it on plugin events.
/// </summary>
public sealed class DynamicToolStore
{
    private readonly ConcurrentDictionary<string, RegisteredTool> _tools = new(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyList<RegisteredTool> List() => [.. _tools.Values];

    public bool TryGet(string toolName, out RegisteredTool? tool)
    {
        if (_tools.TryGetValue(toolName, out var registered))
        {
            tool = registered;
            return true;
        }
        tool = null;
        return false;
    }

    public void Replace(IEnumerable<RegisteredTool> tools)
    {
        _tools.Clear();
        foreach (var t in tools)
        {
            _tools[t.Tool.ProtocolTool.Name] = t;
        }
    }
}

/// <summary>A live MCP tool that came from a Plugin Registry entry.</summary>
public sealed record RegisteredTool(string PluginName, McpServerTool Tool);
