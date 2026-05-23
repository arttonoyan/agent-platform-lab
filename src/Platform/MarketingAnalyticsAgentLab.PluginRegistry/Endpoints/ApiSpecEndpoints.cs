using MarketingAnalyticsAgentLab.PluginRegistry.OpenApi;
using MarketingAnalyticsAgentLab.Shared.Plugins;

namespace MarketingAnalyticsAgentLab.PluginRegistry.Endpoints;

public static class ApiSpecEndpoints
{
    public sealed record ImportApiSpecRequest(string ServiceName, string DisplayName, Uri OpenApiUrl);
    public sealed record ApiSpecSummary(Guid Id, string ServiceName, string DisplayName, Uri BaseAddress,
        DateTimeOffset ImportedAt, int OperationCount);

    public static IEndpointRouteBuilder MapApiSpecEndpoints(this IEndpointRouteBuilder app)
    {
        var apis = app.MapGroup("/apis").WithTags("APIs");

        apis.MapGet("/", async (IPluginRegistryStore store, OpenApiImporter importer, CancellationToken ct) =>
        {
            var specs = await store.ListApiSpecsAsync(ct);
            return specs.Select(s => new ApiSpecSummary(
                s.Id, s.ServiceName, s.DisplayName, s.BaseAddress, s.ImportedAt,
                SafeOperationCount(importer, s))).ToArray();
        })
        .WithName("ListApiSpecs")
        .WithSummary("List imported OpenAPI specs.");

        apis.MapGet("/{id:guid}", async (IPluginRegistryStore store, Guid id, CancellationToken ct)
            => await store.GetApiSpecAsync(id, ct) is { } spec ? Results.Ok(spec) : Results.NotFound())
        .WithName("GetApiSpec")
        .WithSummary("Get the full body of an imported OpenAPI spec.");

        apis.MapGet("/{id:guid}/operations", async (
            IPluginRegistryStore store, OpenApiImporter importer, Guid id, CancellationToken ct) =>
        {
            var spec = await store.GetApiSpecAsync(id, ct);
            if (spec is null) return Results.NotFound();
            return Results.Ok(importer.Parse(spec));
        })
        .WithName("GetApiSpecOperations")
        .WithSummary("Parse the spec into selectable operations for the plugin wizard.");

        apis.MapPost("/import", async (
            ImportApiSpecRequest request,
            OpenApiImporter importer,
            IPluginRegistryStore store,
            CancellationToken ct) =>
        {
            var spec = await importer.ImportAsync(
                serviceName: request.ServiceName,
                displayName: request.DisplayName,
                openApiUrl: request.OpenApiUrl,
                store: store,
                ct: ct);
            return Results.Created($"/apis/{spec.Id}", spec);
        })
        .WithName("ImportApiSpec")
        .WithSummary("Import an OpenAPI document from a standalone-app API. The URL is typically " +
                     "the Aspire service-discovery resolved /openapi/v1.json on an internal API. " +
                     "Idempotent: re-importing the same serviceName updates the existing spec.");

        apis.MapDelete("/{id:guid}", async (IPluginRegistryStore store, Guid id, CancellationToken ct) =>
        {
            await store.DeleteApiSpecAsync(id, ct);
            return Results.NoContent();
        })
        .WithName("DeleteApiSpec")
        .WithSummary("Delete an imported OpenAPI spec. Plugins built from it remain but lose their backing spec.");

        return app;
    }

    private static int SafeOperationCount(OpenApiImporter importer, ApiSpecDefinition spec)
    {
        try { return importer.Parse(spec).Count; }
        catch { return 0; }
    }
}
