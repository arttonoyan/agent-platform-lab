using System.Threading.Channels;

namespace MarketingAnalyticsAgentLab.PluginRegistry.Events;

/// <summary>
/// One event line on the <c>/events</c> SSE stream. Subscribers (McpServer, AgentRuntime)
/// react to <c>plugin.published</c> / <c>plugin.unpublished</c> / <c>agent.changed</c> /
/// <c>assistant.changed</c>.
/// </summary>
public sealed record PluginRegistryEvent(string Type, string? EntityId, string? DisplayName,
    DateTimeOffset OccurredAt);

/// <summary>
/// Fan-out bus that allows multiple long-lived SSE subscribers to receive every event without
/// blocking the publisher. Backed by per-subscriber bounded channels: a slow subscriber that
/// can't keep up will start dropping the oldest pending event.
/// </summary>
public sealed class PluginRegistryEventBus
{
    private readonly List<Channel<PluginRegistryEvent>> _subscribers = new();
    private readonly Lock _gate = new();

    public IAsyncEnumerable<PluginRegistryEvent> SubscribeAsync(CancellationToken ct)
    {
        var channel = Channel.CreateBounded<PluginRegistryEvent>(
            new BoundedChannelOptions(64) { FullMode = BoundedChannelFullMode.DropOldest });

        lock (_gate)
        {
            _subscribers.Add(channel);
        }

        // When the SSE client disconnects, complete the channel so ReadAllAsync exits naturally
        // (no OperationCanceledException). Deliberately do NOT pass the cancellation token into
        // ReadAllAsync - that would surface a benign client-disconnect as an exception in the
        // endpoint pipeline and trigger the debugger's "user-unhandled" break.
        ct.Register(() =>
        {
            channel.Writer.TryComplete();
            lock (_gate)
            {
                _subscribers.Remove(channel);
            }
        });

        return channel.Reader.ReadAllAsync(CancellationToken.None);
    }

    public void Publish(PluginRegistryEvent evt)
    {
        lock (_gate)
        {
            foreach (var sub in _subscribers)
            {
                sub.Writer.TryWrite(evt);
            }
        }
    }
}
