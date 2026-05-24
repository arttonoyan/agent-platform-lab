using MarketingAnalyticsAgentLab.RuntimeTelemetry;

namespace MarketingAnalyticsAgentLab.AiAssistantGateway.Endpoints;

/// <summary>
/// Read-side of the runtime telemetry store. The Admin Portal's AI Runtime Dashboard
/// hits these endpoints; nothing else writes to the store from outside the gateway, so
/// no POST surface is exposed.
/// </summary>
public static class TelemetryEndpoints
{
    public static IEndpointRouteBuilder MapTelemetryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/telemetry").WithTags("Telemetry");

        // List the most recent N executions. Newest first. Defaults to 100 (one screen
        // for the dashboard); cap is enforced inside the store to keep this endpoint
        // safe to hit without auth.
        group.MapGet("/events", async (IExecutionEventStore store, int? limit, CancellationToken ct) =>
                Results.Ok(await store.ListRecentAsync(limit ?? 100, ct)))
            .WithName("ListExecutionEvents")
            .WithSummary("Recent AI runtime execution events with tool calls + policy + token usage. Newest first.");

        group.MapGet("/events/{executionId}", async (string executionId, IExecutionEventStore store, CancellationToken ct) =>
        {
            var dto = await store.GetAsync(executionId, ct);
            return dto is null ? Results.NotFound(new { error = $"execution '{executionId}' not found." }) : Results.Ok(dto);
        })
            .WithName("GetExecutionEvent")
            .WithSummary("Fetch one execution event by id (used by per-execution drill-down).");

        return app;
    }
}
