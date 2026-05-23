using System.Net.ServerSentEvents;
using System.Runtime.CompilerServices;
using MarketingAnalyticsAgentLab.PluginRegistry.Events;

namespace MarketingAnalyticsAgentLab.PluginRegistry.Endpoints;

public static class EventsEndpoint
{
    public static IEndpointRouteBuilder MapEventsEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapGet("/events", (PluginRegistryEventBus bus, CancellationToken ct) =>
            TypedResults.ServerSentEvents(Stream(bus, ct), eventType: "registry"))
            .WithTags("Events")
            .WithName("SubscribeRegistryEvents")
            .WithSummary("SSE stream of registry events (plugin.published, agent.changed, ...). " +
                         "Consumed by McpServer and AgentRuntime to hot-reload their state.");
        return app;
    }

    private static async IAsyncEnumerable<SseItem<PluginRegistryEvent>> Stream(
        PluginRegistryEventBus bus,
        [EnumeratorCancellation] CancellationToken ct)
    {
        // The bus completes its underlying channel on disconnect so the foreach exits without
        // throwing; the explicit IsCancellationRequested check here is a defensive guard for
        // any future bus implementation that propagates cancellation as an exception instead.
        await foreach (var evt in bus.SubscribeAsync(ct))
        {
            if (ct.IsCancellationRequested) yield break;
            yield return new SseItem<PluginRegistryEvent>(evt);
        }
    }
}
