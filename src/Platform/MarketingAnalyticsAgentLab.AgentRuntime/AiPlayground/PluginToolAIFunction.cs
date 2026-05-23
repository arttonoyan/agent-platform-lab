using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using MarketingAnalyticsAgentLab.Shared.Plugins;
using Microsoft.Extensions.AI;

namespace MarketingAnalyticsAgentLab.AgentRuntime.AiPlayground;

/// <summary>
/// An <see cref="AIFunction"/> built dynamically from a <see cref="PluginEndpoint"/>. The
/// name + description handed to the LLM come straight from the plugin definition (the very
/// strings the operator is iterating on in the AdminPortal). On invocation, the function
/// builds the HTTP request described by the endpoint, sends it against the plugin's
/// <see cref="ApiSpecDefinition.BaseAddress"/>, and returns the raw response body parsed as
/// JSON (or as a string for non-JSON content types).
///
/// This is the "AI Playground" equivalent of the HTTP Playground in PluginRegistry. The two
/// share no runtime, by design - the HTTP playground lives in PluginRegistry to keep the
/// LLM dependency out of the plain CRUD surface, while this lives in AgentRuntime where the
/// Azure OpenAI chat client already exists.
/// </summary>
internal sealed class PluginToolAIFunction(
    PluginEndpoint endpoint,
    PluginAuthConfig auth,
    Uri baseAddress,
    HttpClient http,
    List<CapturedToolCall> capture)
    : AIFunction
{
    public override string Name => endpoint.ToolName;
    public override string Description => endpoint.ToolDescription;
    public override JsonElement JsonSchema { get; } = BuildSchema(endpoint);

    protected override async ValueTask<object?> InvokeCoreAsync(
        AIFunctionArguments arguments,
        CancellationToken cancellationToken)
    {
        var args = arguments
            .Where(kv => kv.Value is not null)
            .ToDictionary(kv => kv.Key, kv => StringifyArg(kv.Value), StringComparer.OrdinalIgnoreCase);

        var argsForCapture = JsonSerializer.SerializeToElement(arguments);

        var startedAt = DateTimeOffset.UtcNow;
        try
        {
            using var req = BuildRequest(args);
            http.BaseAddress = baseAddress;
            ApplyAuth(req, auth);

            using var response = await http.SendAsync(req, cancellationToken);
            var raw = await response.Content.ReadAsStringAsync(cancellationToken);
            var contentType = response.Content.Headers.ContentType?.ToString();

            // Try to project the body as a JsonElement so the LLM and the UI can both consume
            // it without an extra parse step. Fall back to the raw string for non-JSON bodies.
            object? parsed;
            try { parsed = JsonDocument.Parse(raw).RootElement.Clone(); }
            catch { parsed = raw; }

            capture.Add(new CapturedToolCall(
                ToolName: endpoint.ToolName,
                Arguments: argsForCapture,
                StatusCode: (int)response.StatusCode,
                ContentType: contentType,
                Result: parsed,
                DurationMs: (int)(DateTimeOffset.UtcNow - startedAt).TotalMilliseconds,
                Error: null));

            return parsed;
        }
        catch (Exception ex)
        {
            capture.Add(new CapturedToolCall(
                ToolName: endpoint.ToolName,
                Arguments: argsForCapture,
                StatusCode: 0,
                ContentType: null,
                Result: null,
                DurationMs: (int)(DateTimeOffset.UtcNow - startedAt).TotalMilliseconds,
                Error: ex.Message));
            // Return the error to the LLM so it can decide whether to retry or apologise.
            return new { error = ex.Message };
        }
    }

    private HttpRequestMessage BuildRequest(IReadOnlyDictionary<string, string> args)
    {
        var path = endpoint.Path;
        var query = new List<string>();
        var headers = new List<(string Name, string Value)>();
        string? body = null;

        foreach (var p in endpoint.Parameters)
        {
            if (!args.TryGetValue(p.Name, out var value) || value is null) continue;
            switch (p.In)
            {
                case PluginParameterLocation.Path:
                    path = path.Replace("{" + p.Name + "}", Uri.EscapeDataString(value), StringComparison.Ordinal);
                    break;
                case PluginParameterLocation.Query:
                    query.Add($"{Uri.EscapeDataString(p.Name)}={Uri.EscapeDataString(value)}");
                    break;
                case PluginParameterLocation.Header:
                    headers.Add((p.Name, value));
                    break;
                case PluginParameterLocation.Body:
                    body = value;
                    break;
            }
        }

        if (query.Count > 0)
        {
            path += (path.Contains('?', StringComparison.Ordinal) ? "&" : "?") + string.Join("&", query);
        }

        var req = new HttpRequestMessage(new HttpMethod(endpoint.Method), path);
        foreach (var (name, value) in headers)
        {
            req.Headers.TryAddWithoutValidation(name, value);
        }
        if (body is not null)
        {
            req.Content = new StringContent(body, Encoding.UTF8, "application/json");
        }
        return req;
    }

    private static void ApplyAuth(HttpRequestMessage req, PluginAuthConfig auth)
    {
        if (auth.Type == PluginAuthType.None || string.IsNullOrWhiteSpace(auth.HeaderName))
        {
            return;
        }
        var secret = Environment.GetEnvironmentVariable(auth.SecretName ?? "") ?? "";
        req.Headers.TryAddWithoutValidation(
            auth.HeaderName,
            auth.Type == PluginAuthType.Bearer ? $"Bearer {secret}" : secret);
    }

    /// <summary>
    /// Builds a minimal JSON Schema describing the function's parameters. This is what the
    /// LLM sees - the parameter <c>name</c> and <c>description</c> directly come from the
    /// plugin definition, so the operator can experiment with descriptions and immediately
    /// see whether the LLM picks the right tool with the right arguments.
    /// </summary>
    private static JsonElement BuildSchema(PluginEndpoint endpoint)
    {
        var properties = new JsonObject();
        var required = new JsonArray();
        foreach (var p in endpoint.Parameters)
        {
            var prop = new JsonObject
            {
                ["type"] = MapJsonSchemaType(p.Type),
            };
            if (!string.IsNullOrWhiteSpace(p.Description))
            {
                prop["description"] = p.Description;
            }
            properties[p.Name] = prop;
            if (p.Required) required.Add(p.Name);
        }

        var schema = new JsonObject
        {
            ["type"] = "object",
            ["properties"] = properties,
            ["required"] = required,
            ["additionalProperties"] = false,
        };
        return JsonSerializer.SerializeToElement(schema);
    }

    private static string MapJsonSchemaType(string raw)
    {
        // The PluginParameter.Type field carries the OpenAPI-style type (or a comma-separated
        // pair like "integer, string"). Project that down to a single JSON schema type for the
        // LLM. We bias towards "string" for ambiguity because every chat model can pass a
        // string and the downstream HTTP request will treat everything as a query/path string.
        var first = raw.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault();
        return first?.ToLowerInvariant() switch
        {
            "integer" or "number" => "number",
            "boolean" => "boolean",
            "array" => "array",
            "object" => "object",
            _ => "string",
        };
    }

    private static string StringifyArg(object? value) => value switch
    {
        null => "",
        string s => s,
        JsonElement je => je.ValueKind switch
        {
            JsonValueKind.String => je.GetString() ?? "",
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Null => "",
            _ => je.GetRawText(),
        },
        _ => value.ToString() ?? "",
    };
}

/// <summary>
/// Wire shape captured for the UI: every tool invocation the LLM performed during one
/// AI-playground run.
/// </summary>
public sealed record CapturedToolCall(
    string ToolName,
    JsonElement Arguments,
    int StatusCode,
    string? ContentType,
    object? Result,
    int DurationMs,
    string? Error);
