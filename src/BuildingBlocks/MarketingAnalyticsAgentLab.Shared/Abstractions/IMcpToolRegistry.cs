namespace MarketingAnalyticsAgentLab.Shared.Abstractions;

/// <summary>
/// Describes a single MCP tool that is live in the platform. The MCP server populates this
/// registry as it loads plugins from the PluginRegistry; the AdminPortal can read it to show
/// "what is currently live in MCP right now".
/// </summary>
public sealed record McpToolDescriptor(
    string Name,
    string PluginName,
    string Description,
    IReadOnlyList<string> InputParameters);

public interface IMcpToolRegistry
{
    IReadOnlyList<McpToolDescriptor> List();
    IReadOnlyList<McpToolDescriptor> ListByPlugin(string pluginName);
    void Register(McpToolDescriptor descriptor);
    void Remove(string toolName);
}
