using MarketingAnalyticsAgentLab.McpServer.PluginRegistryClient;
using MarketingAnalyticsAgentLab.McpServer.Registry;
using MarketingAnalyticsAgentLab.Shared.Abstractions;

namespace MarketingAnalyticsAgentLab.McpServer.DynamicTools;

/// <summary>
/// Owns the lifecycle of plugin-derived MCP tools:
///  - On startup, fetches published plugins from PluginRegistry.
///  - Builds an <see cref="McpServerTool"/> per <c>PluginEndpoint</c> and replaces the
///    <see cref="DynamicToolStore"/> contents.
///  - Subscribes to PluginRegistry's <c>/events</c> SSE stream and reloads on any
///    plugin/agent event so the live tool set stays consistent without restarts.
/// </summary>
public sealed class DynamicPluginToolHost(
    IPluginRegistryClient registryClient,
    DynamicToolStore store,
    PluginToolFactory toolFactory,
    InMemoryMcpToolRegistry catalogRegistry,
    ILogger<DynamicPluginToolHost> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await ReloadAsync(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await foreach (var evt in registryClient.SubscribeEventsAsync(stoppingToken))
                {
                    if (!string.IsNullOrEmpty(evt.Type)
                        && evt.Type.StartsWith("plugin.", StringComparison.Ordinal))
                    {
                        logger.LogInformation("PluginRegistry event '{Type}' received - reloading dynamic tools.", evt.Type);
                        await ReloadAsync(stoppingToken);
                    }
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Lost connection to PluginRegistry /events; retrying in 5s.");
                try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
                catch (OperationCanceledException) { break; }
            }
        }
    }

    private async Task ReloadAsync(CancellationToken ct)
    {
        try
        {
            var plugins = await registryClient.ListPublishedPluginsAsync(ct);
            var registeredTools = new List<RegisteredTool>();

            foreach (var plugin in plugins)
            {
                var spec = await registryClient.GetApiSpecAsync(plugin.ApiSpecId, ct);
                if (spec is null)
                {
                    logger.LogWarning("Plugin {Plugin} references missing API spec {SpecId}; skipping.", plugin.Name, plugin.ApiSpecId);
                    continue;
                }
                foreach (var endpoint in plugin.Endpoints)
                {
                    registeredTools.Add(toolFactory.Build(plugin, endpoint, spec.BaseAddress));
                }
            }

            store.Replace(registeredTools);

            // Mirror into the catalog registry so AdminPortal can list what's live.
            foreach (var t in catalogRegistry.List()) catalogRegistry.Remove(t.Name);
            foreach (var rt in registeredTools)
            {
                var pt = rt.Tool.ProtocolTool;
                catalogRegistry.Register(new McpToolDescriptor(
                    Name: pt.Name,
                    PluginName: rt.PluginName,
                    Description: pt.Description ?? string.Empty,
                    InputParameters: Array.Empty<string>()));
            }

            logger.LogInformation("Loaded {Count} plugin tools from {PluginCount} published plugins.",
                registeredTools.Count, plugins.Count);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to reload plugin tools from PluginRegistry.");
        }
    }
}
