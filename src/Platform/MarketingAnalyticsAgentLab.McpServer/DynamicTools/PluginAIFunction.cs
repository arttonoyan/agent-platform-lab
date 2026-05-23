using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using MarketingAnalyticsAgentLab.Shared.Plugins;
using Microsoft.Extensions.AI;

namespace MarketingAnalyticsAgentLab.McpServer.DynamicTools;

/// <summary>
/// An <see cref="AIFunction"/> whose schema and invocation are built from a
/// <see cref="PluginEndpoint"/> at runtime. This is where the platform's "OpenAPI -> plugin
/// tool" transformation finally meets a real network call: the function translates the
/// agent's tool invocation into an HTTP request to the originating standalone-app API and
/// returns the raw response body as the tool result.
///
/// Every invocation passes through the <see cref="PluginPolicyEvaluator"/> first, which is
/// the platform's seam for per-tenant / per-agent permission enforcement.
/// </summary>
internal sealed class PluginAIFunction : AIFunction
{
    private readonly PluginDefinition _plugin;
    private readonly PluginEndpoint _endpoint;
    private readonly Uri _baseAddress;
    private readonly IHttpClientFactory _httpFactory;
    private readonly PluginPolicyEvaluator _policy;
    private readonly ILogger _logger;
    private readonly JsonElement _inputSchema;

    public PluginAIFunction(
        PluginDefinition plugin,
        PluginEndpoint endpoint,
        Uri baseAddress,
        IHttpClientFactory httpFactory,
        PluginPolicyEvaluator policy,
        ILogger logger)
    {
        _plugin = plugin;
        _endpoint = endpoint;
        _baseAddress = baseAddress;
        _httpFactory = httpFactory;
        _policy = policy;
        _logger = logger;
        _inputSchema = BuildInputSchema(endpoint);
    }

    public override string Name => _endpoint.ToolName;
    public override string Description => _endpoint.ToolDescription;
    public override JsonElement JsonSchema => _inputSchema;

    protected override async ValueTask<object?> InvokeCoreAsync(
        AIFunctionArguments arguments,
        CancellationToken cancellationToken)
    {
        // Plugin Policies / Permissions boundary. Today's evaluator is always-allow but
        // logs the decision; the seam is here so per-tenant/per-agent gates and approval
        // workflows can be added without touching the rest of the platform.
        var decision = _policy.Evaluate(_plugin, tenantId: null, agentName: null);
        if (!decision.Allowed)
        {
            return $"{{\"error\":\"policy.denied\",\"reason\":{JsonSerializer.Serialize(decision.Reason)}}}";
        }

        var path = _endpoint.Path;
        var query = new List<string>();
        var headers = new List<(string Name, string Value)>();
        string? bodyJson = null;

        foreach (var param in _endpoint.Parameters)
        {
            if (!arguments.TryGetValue(param.Name, out var raw) || raw is null) continue;
            var asString = raw is string s ? s :
                raw is JsonElement el ? (el.ValueKind == JsonValueKind.String ? el.GetString() ?? "" : el.GetRawText()) :
                raw.ToString() ?? "";
            switch (param.In)
            {
                case PluginParameterLocation.Path:
                    path = path.Replace("{" + param.Name + "}", Uri.EscapeDataString(asString), StringComparison.Ordinal);
                    break;
                case PluginParameterLocation.Query:
                    query.Add($"{Uri.EscapeDataString(param.Name)}={Uri.EscapeDataString(asString)}");
                    break;
                case PluginParameterLocation.Header:
                    headers.Add((param.Name, asString));
                    break;
                case PluginParameterLocation.Body:
                    bodyJson = asString;
                    break;
            }
        }

        if (query.Count > 0)
        {
            path += (path.Contains('?', StringComparison.Ordinal) ? "&" : "?") + string.Join("&", query);
        }

        var http = _httpFactory.CreateClient("plugin-invoker");
        http.BaseAddress = _baseAddress;

        using var req = new HttpRequestMessage(new HttpMethod(_endpoint.Method), path);
        foreach (var (name, val) in headers)
        {
            req.Headers.TryAddWithoutValidation(name, val);
        }
        if (bodyJson is not null)
        {
            req.Content = new StringContent(bodyJson, Encoding.UTF8, "application/json");
        }
        if (_plugin.Auth.Type != PluginAuthType.None && !string.IsNullOrWhiteSpace(_plugin.Auth.HeaderName))
        {
            var secret = Environment.GetEnvironmentVariable(_plugin.Auth.SecretName ?? "") ?? "";
            req.Headers.TryAddWithoutValidation(_plugin.Auth.HeaderName,
                _plugin.Auth.Type == PluginAuthType.Bearer ? $"Bearer {secret}" : secret);
        }

        try
        {
            using var resp = await http.SendAsync(req, cancellationToken);
            var body = await resp.Content.ReadAsStringAsync(cancellationToken);
            if (!resp.IsSuccessStatusCode)
            {
                return $"{{\"error\":\"{(int)resp.StatusCode} {resp.ReasonPhrase}\",\"body\":{JsonSerializer.Serialize(body)}}}";
            }
            return body;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Plugin tool {Tool} failed", _endpoint.ToolName);
            return $"{{\"error\":{JsonSerializer.Serialize(ex.Message)}}}";
        }
    }

    private static JsonElement BuildInputSchema(PluginEndpoint endpoint)
    {
        var properties = new JsonObject();
        var required = new JsonArray();
        foreach (var p in endpoint.Parameters)
        {
            properties[p.Name] = new JsonObject
            {
                ["type"] = MapJsonSchemaType(p.Type),
                ["description"] = p.Description ?? "",
            };
            if (p.Required)
            {
                required.Add(p.Name);
            }
        }
        var schema = new JsonObject
        {
            ["type"] = "object",
            ["properties"] = properties,
            ["required"] = required,
        };
        return JsonSerializer.SerializeToElement(schema);
    }

    private static string MapJsonSchemaType(string type) => type.ToLowerInvariant() switch
    {
        "integer" => "integer",
        "number" => "number",
        "boolean" => "boolean",
        "array" => "array",
        "object" => "object",
        _ => "string",
    };
}
