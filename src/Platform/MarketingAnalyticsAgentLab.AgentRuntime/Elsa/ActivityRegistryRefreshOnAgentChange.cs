using MarketingAnalyticsAgentLab.AgentRuntime.PluginRegistryClient;
using MarketingAnalyticsAgentLab.AgentRuntime.Agents;
using Elsa.Workflows;

namespace MarketingAnalyticsAgentLab.AgentRuntime.Elsa;

/// <summary>
/// Listens to PluginRegistry events and asks Elsa to refresh the activity registry
/// whenever an agent or plugin changes, so the dynamic Agents/&lt;name&gt; palette items
/// stay in sync with the live <see cref="RuntimeAgentRegistry"/>.
///
/// Without this, Elsa Studio would cache the activity list it loaded at startup and the
/// operator would have to bounce the agent-runtime to see new agents in the palette.
///
/// Runs in addition to <see cref="AgentLifecycleService"/> (which rebuilds the live
/// agent instances themselves) — they consume the same SSE feed independently so a
/// failure in one doesn't break the other.
/// </summary>
public sealed class ActivityRegistryRefreshOnAgentChange(
    IPluginRegistryClient registryClient,
    IServiceProvider services,
    ILogger<ActivityRegistryRefreshOnAgentChange> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Initial publish: emit descriptors for whatever agents are loaded at startup.
        await RefreshAsync(stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await foreach (var evt in registryClient.SubscribeEventsAsync(stoppingToken))
                {
                    if (string.IsNullOrEmpty(evt.Type)) continue;
                    if (evt.Type.StartsWith("agent.", StringComparison.Ordinal) ||
                        evt.Type.StartsWith("plugin.", StringComparison.Ordinal))
                    {
                        // Give AgentLifecycleService a moment to finish its own rebuild —
                        // the AgentActivityProvider reads RuntimeAgentRegistry, which
                        // lifecycle owns. 250ms is enough in practice and avoids a fight
                        // with parallel rebuilds.
                        try { await Task.Delay(TimeSpan.FromMilliseconds(250), stoppingToken); }
                        catch (OperationCanceledException) { return; }

                        await RefreshAsync(stoppingToken);
                    }
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Activity registry refresh loop lost the registry event feed; retrying in 5s.");
                try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
                catch (OperationCanceledException) { break; }
            }
        }
    }

    private async Task RefreshAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = services.CreateScope();
            var registry = scope.ServiceProvider.GetRequiredService<IActivityRegistry>();
            var provider = scope.ServiceProvider.GetRequiredService<AgentActivityProvider>();
            await registry.RefreshDescriptorsAsync(provider, cancellationToken);
            logger.LogInformation("Elsa activity registry refreshed — dynamic Agents/<name> descriptors are up to date.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to refresh Elsa activity registry from agent changes.");
        }
    }
}
