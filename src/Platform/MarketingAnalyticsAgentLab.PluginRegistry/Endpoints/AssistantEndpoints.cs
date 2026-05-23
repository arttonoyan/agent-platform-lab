using MarketingAnalyticsAgentLab.PluginRegistry.Events;
using MarketingAnalyticsAgentLab.Shared.Assistants;

namespace MarketingAnalyticsAgentLab.PluginRegistry.Endpoints;

public static class AssistantEndpoints
{
    public sealed record UpsertAssistantRequest(
        string AssistantId,
        string DisplayName,
        string Application,
        string Description,
        IReadOnlyList<string> AgentNames,
        string? DefaultAgentName,
        string? SystemPreamble,
        bool Enabled);

    public static IEndpointRouteBuilder MapAssistantEndpoints(this IEndpointRouteBuilder app)
    {
        var assistants = app.MapGroup("/assistants").WithTags("Assistants");

        assistants.MapGet("/", async (IAssistantRegistry registry, CancellationToken ct)
            => await registry.ListAsync(ct))
        .WithName("ListAssistants");

        assistants.MapGet("/{assistantId}", async (IAssistantRegistry registry, string assistantId, CancellationToken ct)
            => await registry.GetAsync(assistantId, ct) is { } a ? Results.Ok(a) : Results.NotFound())
        .WithName("GetAssistant");

        assistants.MapPost("/", async (
            UpsertAssistantRequest request,
            IAssistantRegistry registry,
            PluginRegistryEventBus bus,
            CancellationToken ct) =>
        {
            var def = new AssistantDefinition(
                AssistantId: request.AssistantId,
                DisplayName: request.DisplayName,
                Application: request.Application,
                Description: request.Description,
                AgentNames: request.AgentNames,
                DefaultAgentName: request.DefaultAgentName,
                SystemPreamble: request.SystemPreamble,
                Enabled: request.Enabled);
            await registry.SaveAsync(def, ct);
            bus.Publish(new PluginRegistryEvent("assistant.changed", def.AssistantId, def.DisplayName, DateTimeOffset.UtcNow));
            return Results.Ok(def);
        })
        .WithName("CreateAssistant");

        assistants.MapPut("/{assistantId}", async (
            string assistantId,
            UpsertAssistantRequest request,
            IAssistantRegistry registry,
            PluginRegistryEventBus bus,
            CancellationToken ct) =>
        {
            if (!string.Equals(assistantId, request.AssistantId, StringComparison.OrdinalIgnoreCase))
            {
                return Results.BadRequest(new { error = "assistantId in URL and body must match." });
            }
            var def = new AssistantDefinition(
                request.AssistantId, request.DisplayName, request.Application, request.Description,
                request.AgentNames, request.DefaultAgentName, request.SystemPreamble, request.Enabled);
            await registry.SaveAsync(def, ct);
            bus.Publish(new PluginRegistryEvent("assistant.changed", def.AssistantId, def.DisplayName, DateTimeOffset.UtcNow));
            return Results.Ok(def);
        })
        .WithName("UpdateAssistant");

        assistants.MapDelete("/{assistantId}", async (
            string assistantId,
            IAssistantRegistry registry,
            PluginRegistryEventBus bus,
            CancellationToken ct) =>
        {
            await registry.DeleteAsync(assistantId, ct);
            bus.Publish(new PluginRegistryEvent("assistant.deleted", assistantId, null, DateTimeOffset.UtcNow));
            return Results.NoContent();
        })
        .WithName("DeleteAssistant");

        return app;
    }
}
