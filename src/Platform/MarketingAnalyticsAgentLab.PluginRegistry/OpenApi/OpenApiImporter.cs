using MarketingAnalyticsAgentLab.Shared.Plugins;

namespace MarketingAnalyticsAgentLab.PluginRegistry.OpenApi;

/// <summary>
/// The <c>OpenAPI Importer</c> is the first stage of the plugin authoring pipeline:
///
///   AdminPortal -> OpenAPI Importer -> PluginRegistry -> Plugin Editor / Playground -> Publish
///
/// It fetches an OpenAPI document from a standalone application's discovery URL, parses it
/// into selectable operations, and persists the raw spec so subsequent stages can re-parse
/// without making another network call.
/// </summary>
public sealed class OpenApiImporter(IHttpClientFactory httpFactory, ILogger<OpenApiImporter> logger)
{
    /// <summary>
    /// Fetch and persist an OpenAPI document for a standalone application's API.
    /// </summary>
    /// <param name="serviceName">Aspire service name (e.g. <c>analytics-api</c>).</param>
    /// <param name="displayName">Operator-friendly name shown in the Admin Portal.</param>
    /// <param name="openApiUrl">Absolute URL to the OpenAPI JSON document.</param>
    /// <param name="store">Plugin registry persistence seam.</param>
    public async Task<ApiSpecDefinition> ImportAsync(
        string serviceName,
        string displayName,
        Uri openApiUrl,
        IPluginRegistryStore store,
        CancellationToken ct)
    {
        using var http = httpFactory.CreateClient("api-spec-fetch");
        logger.LogInformation("Importing OpenAPI spec for '{Service}' from {Url}", serviceName, openApiUrl);
        var doc = await http.GetStringAsync(openApiUrl, ct);

        // Validate the document parses before we commit it to disk.
        var parsedOperations = OpenApiOperationParser.Parse(doc);

        var baseAddress = new Uri(openApiUrl.GetLeftPart(UriPartial.Authority));

        // Idempotent import: if a spec for this service already exists, update it in place
        // rather than creating a new entry. The service name is the natural unique key for a
        // standalone-app API.
        var existing = (await store.ListApiSpecsAsync(ct))
            .FirstOrDefault(s => string.Equals(s.ServiceName, serviceName, StringComparison.OrdinalIgnoreCase));

        var spec = new ApiSpecDefinition(
            Id: existing?.Id ?? Guid.NewGuid(),
            ServiceName: serviceName,
            DisplayName: displayName,
            BaseAddress: baseAddress,
            OpenApiDocument: doc,
            ImportedAt: DateTimeOffset.UtcNow);
        await store.SaveApiSpecAsync(spec, ct);
        logger.LogInformation("OpenAPI spec '{Service}' {Action} as {Id} ({Count} operations).",
            serviceName,
            existing is null ? "imported" : "re-imported",
            spec.Id,
            parsedOperations.Count);
        return spec;
    }

    /// <summary>Re-parse a previously-imported spec into selectable operations.</summary>
    public IReadOnlyList<ApiOperation> Parse(ApiSpecDefinition spec) =>
        OpenApiOperationParser.Parse(spec.OpenApiDocument);
}
