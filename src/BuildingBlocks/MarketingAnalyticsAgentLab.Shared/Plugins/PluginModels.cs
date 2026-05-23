namespace MarketingAnalyticsAgentLab.Shared.Plugins;

/// <summary>
/// An OpenAPI specification imported into the platform. The original document is stored
/// verbatim so the McpServer and AdminPortal can re-parse it on demand.
/// </summary>
public sealed record ApiSpecDefinition(
    Guid Id,
    string ServiceName,
    string DisplayName,
    Uri BaseAddress,
    string OpenApiDocument,
    DateTimeOffset ImportedAt);

public sealed record ApiOperation(
    string OperationId,
    string Method,
    string Path,
    string Summary,
    string Description,
    IReadOnlyList<PluginParameter> Parameters,
    string? RequestSchemaJson,
    string? ResponseSchemaJson);

public enum PluginParameterLocation
{
    Path = 0,
    Query = 1,
    Header = 2,
    Body = 3,
}

public sealed record PluginParameter(
    string Name,
    PluginParameterLocation In,
    string Type,
    bool Required,
    string? Description,
    string? DefaultValue);

public enum PluginAuthType
{
    None = 0,
    ApiKey = 1,
    Bearer = 2,
    ClientCredentials = 3,
}

public sealed record PluginAuthConfig(
    PluginAuthType Type,
    string? HeaderName,
    string? SecretName,
    IReadOnlyDictionary<string, string>? ExtraSettings);

public sealed record PluginPermissions(
    IReadOnlyList<string> AllowedAgents,
    IReadOnlyList<string> AllowedTenants,
    bool RequiresApproval);

public sealed record PluginEndpoint(
    string OperationId,
    string Method,
    string Path,
    string ToolName,
    string ToolDescription,
    IReadOnlyList<PluginParameter> Parameters,
    string? ResponseSchemaJson);

public enum PluginStatus
{
    Draft = 0,
    Testing = 1,
    Published = 2,
    Disabled = 3,
}

public sealed record PluginDefinition(
    Guid Id,
    string Name,
    string DisplayName,
    string Description,
    Guid ApiSpecId,
    IReadOnlyList<PluginEndpoint> Endpoints,
    PluginAuthConfig Auth,
    PluginPermissions Permissions,
    PluginStatus Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

/// <summary>
/// Persistence seam for the Plugin Registry. The reference implementation writes JSON files
/// to disk; tests use an in-memory variant; future work can swap in a relational database.
/// </summary>
public interface IPluginRegistryStore
{
    Task<IReadOnlyList<ApiSpecDefinition>> ListApiSpecsAsync(CancellationToken ct);
    Task<ApiSpecDefinition?> GetApiSpecAsync(Guid id, CancellationToken ct);
    Task<ApiSpecDefinition> SaveApiSpecAsync(ApiSpecDefinition spec, CancellationToken ct);
    Task DeleteApiSpecAsync(Guid id, CancellationToken ct);

    Task<IReadOnlyList<PluginDefinition>> ListPluginsAsync(PluginStatus? statusFilter, CancellationToken ct);
    Task<PluginDefinition?> GetPluginAsync(Guid id, CancellationToken ct);
    Task<PluginDefinition> SavePluginAsync(PluginDefinition plugin, CancellationToken ct);
    Task DeletePluginAsync(Guid id, CancellationToken ct);
}
