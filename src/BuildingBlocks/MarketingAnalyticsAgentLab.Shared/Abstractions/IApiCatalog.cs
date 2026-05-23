namespace MarketingAnalyticsAgentLab.Shared.Abstractions;

/// <summary>
/// Describes a registered downstream API that the platform exposes (typically via the MCP
/// server). Today this is populated statically; tomorrow it can be sourced from a service
/// registry, K8s discovery, or live OpenAPI document scraping.
/// </summary>
public sealed record ApiEndpointDescriptor(
    string ServiceName,
    string DisplayName,
    Uri BaseAddress,
    string? OpenApiDocumentUrl);

public interface IApiCatalog
{
    IReadOnlyList<ApiEndpointDescriptor> List();
    void Register(ApiEndpointDescriptor descriptor);
}
