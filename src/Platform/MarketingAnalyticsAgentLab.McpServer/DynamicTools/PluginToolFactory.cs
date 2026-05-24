using MarketingAnalyticsAgentLab.McpServer.Registry;
using MarketingAnalyticsAgentLab.Shared.Plugins;
using ModelContextProtocol.Server;

namespace MarketingAnalyticsAgentLab.McpServer.DynamicTools;

/// <summary>
/// Builds one live <see cref="McpServerTool"/> per <see cref="PluginEndpoint"/>. The tool
/// implementation routes through <see cref="PluginAIFunction"/>, which calls the original
/// standalone-app API and applies the platform's Plugin Policies / Permissions layer.
/// </summary>
public sealed class PluginToolFactory(
    IHttpClientFactory httpFactory,
    PluginPolicyEvaluator policy,
    ExecutionLog executionLog,
    ILoggerFactory loggerFactory)
{
    public RegisteredTool Build(PluginDefinition plugin, PluginEndpoint endpoint, Uri baseAddress)
    {
        var logger = loggerFactory.CreateLogger($"PluginTool.{plugin.Name}.{endpoint.ToolName}");
        var function = new PluginAIFunction(plugin, endpoint, baseAddress, httpFactory, policy, executionLog, logger);
        var tool = McpServerTool.Create(function, new McpServerToolCreateOptions
        {
            Name = endpoint.ToolName,
            Description = endpoint.ToolDescription,
        });
        return new RegisteredTool(plugin.Name, tool);
    }
}
