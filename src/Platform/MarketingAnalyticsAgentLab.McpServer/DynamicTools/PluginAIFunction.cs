using System.Diagnostics;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using MarketingAnalyticsAgentLab.McpServer.Registry;
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
    private readonly ExecutionLog _executionLog;
    private readonly ILogger _logger;
    private readonly JsonElement _inputSchema;

    public PluginAIFunction(
        PluginDefinition plugin,
        PluginEndpoint endpoint,
        Uri baseAddress,
        IHttpClientFactory httpFactory,
        PluginPolicyEvaluator policy,
        ExecutionLog executionLog,
        ILogger logger)
    {
        _plugin = plugin;
        _endpoint = endpoint;
        _baseAddress = baseAddress;
        _httpFactory = httpFactory;
        _policy = policy;
        _executionLog = executionLog;
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
        var sw = Stopwatch.StartNew();
        var argsPreview = PreviewArguments(arguments);

        // Plugin Policies / Permissions boundary. Today's evaluator is always-allow but
        // logs the decision; the seam is here so per-tenant/per-agent gates and approval
        // workflows can be added without touching the rest of the platform.
        var decision = _policy.Evaluate(_plugin, tenantId: null, agentName: null);
        if (!decision.Allowed)
        {
            var body = $"{{\"error\":\"policy.denied\",\"reason\":{JsonSerializer.Serialize(decision.Reason)}}}";
            sw.Stop();
            RecordExecution(argsPreview, body, statusCode: 0, sw.ElapsedMilliseconds, status: "policy-denied", error: decision.Reason);
            return body;
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
            sw.Stop();
            if (!resp.IsSuccessStatusCode)
            {
                var errorPayload = $"{{\"error\":\"{(int)resp.StatusCode} {resp.ReasonPhrase}\",\"body\":{JsonSerializer.Serialize(body)}}}";
                RecordExecution(argsPreview, body, (int)resp.StatusCode, sw.ElapsedMilliseconds, "tool-error", $"{(int)resp.StatusCode} {resp.ReasonPhrase}");
                return errorPayload;
            }
            RecordExecution(argsPreview, body, (int)resp.StatusCode, sw.ElapsedMilliseconds, "success", null);
            return body;
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogWarning(ex, "Plugin tool {Tool} failed", _endpoint.ToolName);
            RecordExecution(argsPreview, ex.Message, statusCode: 0, sw.ElapsedMilliseconds, "tool-error", ex.Message);
            return $"{{\"error\":{JsonSerializer.Serialize(ex.Message)}}}";
        }
    }

    private void RecordExecution(string argsPreview, string resultBody, int statusCode, long durationMs, string status, string? error)
    {
        try
        {
            _executionLog.Record(new ToolExecutionRecord(
                Id: Guid.NewGuid().ToString("N"),
                OccurredAt: DateTimeOffset.UtcNow,
                ToolName: _endpoint.ToolName,
                PluginName: _plugin.Name,
                Method: _endpoint.Method,
                Path: _endpoint.Path,
                AgentName: null,
                ArgumentsPreview: argsPreview,
                ResultPreview: Truncate(resultBody, 480),
                StatusCode: statusCode,
                DurationMs: (int)durationMs,
                Status: status,
                Error: error));
        }
        catch (Exception ex)
        {
            // Logging the execution must never break the tool call itself.
            _logger.LogDebug(ex, "Failed to record execution for tool {Tool}.", _endpoint.ToolName);
        }
    }

    private static string PreviewArguments(AIFunctionArguments arguments)
    {
        try
        {
            var dict = arguments.ToDictionary(kv => kv.Key, kv => kv.Value);
            var json = JsonSerializer.Serialize(dict);
            return Truncate(json, 240);
        }
        catch
        {
            return "{}";
        }
    }

    private static string Truncate(string? value, int max)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value.Length <= max ? value : value[..max] + "...";
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
