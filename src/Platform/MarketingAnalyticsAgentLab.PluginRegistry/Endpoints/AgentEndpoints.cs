using MarketingAnalyticsAgentLab.PluginRegistry.Events;
using MarketingAnalyticsAgentLab.Shared.Agents;

namespace MarketingAnalyticsAgentLab.PluginRegistry.Endpoints;

public static class AgentDefinitionEndpoints
{
    public sealed record UpsertAgentRequest(
        Guid? Id,
        string Name,
        string DisplayName,
        string Description,
        string Instructions,
        string ModelDeployment,
        IReadOnlyList<Guid> PluginIds,
        IReadOnlyList<string>? RoutingHints);

    public static IEndpointRouteBuilder MapAgentDefinitionEndpoints(this IEndpointRouteBuilder app)
    {
        var agents = app.MapGroup("/agents").WithTags("Agents");

        agents.MapGet("/", async (IAgentDefinitionStore store, CancellationToken ct)
            => await store.ListAsync(ct))
        .WithName("ListAgentDefinitions");

        agents.MapGet("/{id:guid}", async (IAgentDefinitionStore store, Guid id, CancellationToken ct)
            => await store.GetAsync(id, ct) is { } a ? Results.Ok(a) : Results.NotFound())
        .WithName("GetAgentDefinition");

        agents.MapPost("/", async (
            UpsertAgentRequest request,
            IAgentDefinitionStore store,
            PluginRegistryEventBus bus,
            CancellationToken ct) =>
        {
            var def = new AgentDefinition(
                Id: request.Id ?? Guid.NewGuid(),
                Name: request.Name,
                DisplayName: request.DisplayName,
                Description: request.Description,
                Instructions: request.Instructions,
                ModelDeployment: request.ModelDeployment,
                PluginIds: request.PluginIds,
                RoutingHints: request.RoutingHints);
            await store.SaveAsync(def, ct);
            bus.Publish(new PluginRegistryEvent("agent.changed", def.Id.ToString(), def.DisplayName, DateTimeOffset.UtcNow));
            return Results.Ok(def);
        })
        .WithName("CreateAgentDefinition");

        agents.MapPut("/{id:guid}", async (
            Guid id,
            UpsertAgentRequest request,
            IAgentDefinitionStore store,
            PluginRegistryEventBus bus,
            CancellationToken ct) =>
        {
            var existing = await store.GetAsync(id, ct);
            if (existing is null) return Results.NotFound();
            var def = existing with
            {
                Name = request.Name,
                DisplayName = request.DisplayName,
                Description = request.Description,
                Instructions = request.Instructions,
                ModelDeployment = request.ModelDeployment,
                PluginIds = request.PluginIds,
                RoutingHints = request.RoutingHints,
            };
            await store.SaveAsync(def, ct);
            bus.Publish(new PluginRegistryEvent("agent.changed", id.ToString(), def.DisplayName, DateTimeOffset.UtcNow));
            return Results.Ok(def);
        })
        .WithName("UpdateAgentDefinition");

        agents.MapDelete("/{id:guid}", async (
            Guid id,
            IAgentDefinitionStore store,
            PluginRegistryEventBus bus,
            CancellationToken ct) =>
        {
            await store.DeleteAsync(id, ct);
            bus.Publish(new PluginRegistryEvent("agent.deleted", id.ToString(), null, DateTimeOffset.UtcNow));
            return Results.NoContent();
        })
        .WithName("DeleteAgentDefinition");

        return app;
    }
}
