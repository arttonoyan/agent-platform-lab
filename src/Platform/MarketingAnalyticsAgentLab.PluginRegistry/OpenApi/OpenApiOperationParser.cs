using MarketingAnalyticsAgentLab.Shared.Plugins;
using Microsoft.OpenApi;
using Microsoft.OpenApi.Reader;

namespace MarketingAnalyticsAgentLab.PluginRegistry.OpenApi;

/// <summary>
/// Parses an OpenAPI JSON document into a list of <see cref="ApiOperation"/> records suitable
/// for the AdminPortal "pick endpoints to expose as plugin tools" wizard.
/// </summary>
public static class OpenApiOperationParser
{
    public static IReadOnlyList<ApiOperation> Parse(string openApiJson)
    {
        var readResult = OpenApiDocument.Parse(openApiJson, "json");
        var doc = readResult.Document
            ?? throw new InvalidOperationException("Failed to parse OpenAPI document.");

        var operations = new List<ApiOperation>();
        if (doc.Paths is null)
        {
            return operations;
        }

        foreach (var (path, pathItem) in doc.Paths)
        {
            if (pathItem.Operations is null) continue;
            foreach (var (method, op) in pathItem.Operations)
            {
                if (op is null) continue;
                var opId = op.OperationId
                    ?? $"{method.ToString().ToLowerInvariant()}_{Sanitize(path)}";

                var parameters = new List<PluginParameter>();

                if (op.Parameters is not null)
                {
                    foreach (var p in op.Parameters)
                    {
                        var location = MapLocation(p.In);
                        if (location is null) continue;
                        parameters.Add(new PluginParameter(
                            Name: p.Name ?? "",
                            In: location.Value,
                            Type: ExtractType(p.Schema),
                            Required: p.Required,
                            Description: p.Description,
                            DefaultValue: null));
                    }
                }

                if (op.RequestBody is not null && op.RequestBody.Content is not null)
                {
                    foreach (var (mediaType, content) in op.RequestBody.Content)
                    {
                        if (!mediaType.StartsWith("application/json", StringComparison.OrdinalIgnoreCase)) continue;
                        parameters.Add(new PluginParameter(
                            Name: "body",
                            In: PluginParameterLocation.Body,
                            Type: ExtractType(content.Schema),
                            Required: op.RequestBody.Required,
                            Description: op.RequestBody.Description ?? "Request body (JSON).",
                            DefaultValue: null));
                        break;
                    }
                }

                operations.Add(new ApiOperation(
                    OperationId: opId,
                    Method: method.ToString().ToUpperInvariant(),
                    Path: path,
                    Summary: op.Summary ?? string.Empty,
                    Description: op.Description ?? op.Summary ?? string.Empty,
                    Parameters: parameters,
                    RequestSchemaJson: null,
                    ResponseSchemaJson: null));
            }
        }
        return operations;
    }

    private static PluginParameterLocation? MapLocation(ParameterLocation? location) => location switch
    {
        ParameterLocation.Path => PluginParameterLocation.Path,
        ParameterLocation.Query => PluginParameterLocation.Query,
        ParameterLocation.Header => PluginParameterLocation.Header,
        _ => null,
    };

    private static string ExtractType(IOpenApiSchema? schema)
    {
        if (schema is null) return "string";
        if (schema.Type is JsonSchemaType.Null or null) return "string";
        return schema.Type.ToString()!.ToLowerInvariant();
    }

    private static string Sanitize(string s)
        => new(s.Select(c => char.IsLetterOrDigit(c) ? c : '_').ToArray());
}
