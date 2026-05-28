using System.Diagnostics;
using System.Text;
using System.Text.Json;
using MarketingAnalyticsAgentLab.AgentRuntime.PluginRegistryClient;
using MarketingAnalyticsAgentLab.Shared.Plugins;

namespace MarketingAnalyticsAgentLab.AgentRuntime.Elsa;

/// <summary>
/// Invokes a published Tool Set tool by name, end-to-end. Used by Elsa workflow
/// activities (<see cref="PluginToolActivity"/>) so workflows can call the same tools
/// agents call, going through the same Tool Runtime path.
///
/// Lookup strategy: list all <c>Published</c> Tool Sets from PluginRegistry, find the
/// one whose endpoints contain <paramref name="toolName"/>. The lookup is per-call
/// today; a cache invalidated by the registry's SSE event stream is the next
/// optimization once we see real call volume.
/// </summary>
public interface IPluginToolRunner
{
    Task<PluginToolInvocationResult> InvokeAsync(string toolName, string argumentsJson, CancellationToken ct);
}

public sealed record PluginToolInvocationResult(
    string ToolName,
    string PluginName,
    int StatusCode,
    string? ContentType,
    string Body,
    int DurationMs,
    string? Error);

public sealed class PluginToolRunner(
    IPluginRegistryClient registryClient,
    IHttpClientFactory httpFactory,
    ILogger<PluginToolRunner> logger) : IPluginToolRunner
{
    private const string HttpClientName = "elsa-tool-runner";

    public async Task<PluginToolInvocationResult> InvokeAsync(string toolName, string argumentsJson, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(toolName))
        {
            return new PluginToolInvocationResult(
                ToolName: toolName ?? "(empty)",
                PluginName: string.Empty,
                StatusCode: 0,
                ContentType: null,
                Body: string.Empty,
                DurationMs: 0,
                Error: "Tool name is required.");
        }

        var plugins = await registryClient.ListPublishedPluginsAsync(ct);
        var match = FindToolInPlugins(plugins, toolName);
        if (match is null)
        {
            return new PluginToolInvocationResult(
                ToolName: toolName,
                PluginName: string.Empty,
                StatusCode: 0,
                ContentType: null,
                Body: string.Empty,
                DurationMs: 0,
                Error: $"No published Tool Set exposes a tool named '{toolName}'. " +
                       "Check the Tools page — only Published Tool Sets are discoverable.");
        }

        var (plugin, endpoint) = match.Value;

        var spec = await registryClient.GetApiSpecAsync(plugin.ApiSpecId, ct);
        if (spec is null)
        {
            return new PluginToolInvocationResult(
                ToolName: toolName,
                PluginName: plugin.DisplayName,
                StatusCode: 0,
                ContentType: null,
                Body: string.Empty,
                DurationMs: 0,
                Error: $"Tool Set '{plugin.DisplayName}' references API spec {plugin.ApiSpecId} but that spec was not found. " +
                       "Re-import the API and retry.");
        }

        var args = ParseArguments(argumentsJson);

        var sw = Stopwatch.StartNew();
        try
        {
            using var req = BuildRequest(endpoint, args);
            var http = httpFactory.CreateClient(HttpClientName);
            http.BaseAddress = spec.BaseAddress;
            ApplyAuth(req, plugin.Auth);
            using var response = await http.SendAsync(req, ct);
            var body = await response.Content.ReadAsStringAsync(ct);
            sw.Stop();
            return new PluginToolInvocationResult(
                ToolName: toolName,
                PluginName: plugin.DisplayName,
                StatusCode: (int)response.StatusCode,
                ContentType: response.Content.Headers.ContentType?.ToString(),
                Body: body,
                DurationMs: (int)sw.ElapsedMilliseconds,
                Error: null);
        }
        catch (Exception ex)
        {
            sw.Stop();
            logger.LogError(ex, "Elsa tool invocation failed: tool={Tool} plugin={Plugin}", toolName, plugin.DisplayName);
            return new PluginToolInvocationResult(
                ToolName: toolName,
                PluginName: plugin.DisplayName,
                StatusCode: 0,
                ContentType: null,
                Body: string.Empty,
                DurationMs: (int)sw.ElapsedMilliseconds,
                Error: ex.Message);
        }
    }

    private static (PluginDefinition Plugin, PluginEndpoint Endpoint)? FindToolInPlugins(
        IReadOnlyList<PluginDefinition> plugins, string toolName)
    {
        foreach (var plugin in plugins)
        {
            foreach (var endpoint in plugin.Endpoints)
            {
                if (string.Equals(endpoint.ToolName, toolName, StringComparison.OrdinalIgnoreCase))
                {
                    return (plugin, endpoint);
                }
            }
        }
        return null;
    }

    private static Dictionary<string, string> ParseArguments(string? argumentsJson)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(argumentsJson)) return result;
        try
        {
            using var doc = JsonDocument.Parse(argumentsJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return result;
            foreach (var p in doc.RootElement.EnumerateObject())
            {
                result[p.Name] = p.Value.ValueKind switch
                {
                    JsonValueKind.String => p.Value.GetString() ?? string.Empty,
                    JsonValueKind.Number => p.Value.GetRawText(),
                    JsonValueKind.True   => "true",
                    JsonValueKind.False  => "false",
                    JsonValueKind.Null   => string.Empty,
                    _                    => p.Value.GetRawText(),
                };
            }
        }
        catch (JsonException)
        {
            // Operator wrote invalid JSON in the Arguments input; carry empty dict and
            // let the upstream API surface the resulting validation error.
        }
        return result;
    }

    /// <summary>
    /// Mirrors <c>PluginToolAIFunction.BuildRequest</c> in the AI Playground module so
    /// workflow tool calls hit the same wire shape as agent tool calls. Keeping the
    /// two implementations small and parallel is intentional — extracting them into a
    /// shared "tool runtime" library is a clean refactor once we have a third caller.
    /// </summary>
    private static HttpRequestMessage BuildRequest(PluginEndpoint endpoint, IReadOnlyDictionary<string, string> args)
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
        if (auth.Type == PluginAuthType.None) return;
        var secret = auth.SecretName is null ? null : Environment.GetEnvironmentVariable(auth.SecretName);
        if (string.IsNullOrEmpty(secret)) return;
        switch (auth.Type)
        {
            case PluginAuthType.ApiKey when !string.IsNullOrEmpty(auth.HeaderName):
                req.Headers.TryAddWithoutValidation(auth.HeaderName, secret);
                break;
            case PluginAuthType.Bearer:
                req.Headers.TryAddWithoutValidation("Authorization", $"Bearer {secret}");
                break;
        }
    }
}
