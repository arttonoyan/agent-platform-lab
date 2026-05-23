using MarketingAnalyticsAgentLab.AgentRuntime.AiPlayground;

namespace MarketingAnalyticsAgentLab.AgentRuntime.Endpoints;

public static class PluginPlaygroundEndpoints
{
    public sealed record AiPlaygroundRequest(string Message);

    public static IEndpointRouteBuilder MapPluginPlaygroundEndpoints(this IEndpointRouteBuilder app)
    {
        var plugins = app.MapGroup("/plugins").WithTags("PluginPlayground");

        plugins.MapPost("/{id:guid}/ai-playground", async (
            Guid id,
            AiPlaygroundRequest request,
            PluginAiPlaygroundService service,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request?.Message))
            {
                return Results.BadRequest(new { error = "Message is required." });
            }

            var result = await service.RunAsync(id, request.Message, ct);
            if (result.Error is not null)
            {
                // Still return 200 with the error payload so the UI can render the captured
                // tool calls (which may include the partial failure). A 4xx would discard them.
                return Results.Ok(result);
            }
            return Results.Ok(result);
        })
        .WithName("RunPluginAiPlayground")
        .WithSummary("Run a single LLM turn against this plugin's tools, returning the reply " +
                     "and every tool call the LLM made. Works on draft plugins too - the plugin " +
                     "does not need to be published.");

        return app;
    }
}
