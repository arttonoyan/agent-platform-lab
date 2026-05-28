using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using MarketingAnalyticsAgentLab.ServiceDefaults;
using MarketingAnalyticsAgentLab.Shared.Agents;
using MarketingAnalyticsAgentLab.Shared.Assistants;
using MarketingAnalyticsAgentLab.Shared.Plugins;

namespace MarketingAnalyticsAgentLab.AgentRuntime.PluginRegistryClient;

public sealed record RegistryEvent(string Type, string? EntityId, string? DisplayName, DateTimeOffset OccurredAt);

public interface IPluginRegistryClient
{
    Task<IReadOnlyList<AgentDefinition>> ListAgentsAsync(CancellationToken ct);
    Task<IReadOnlyList<AssistantDefinition>> ListAssistantsAsync(CancellationToken ct);
    Task<AssistantDefinition?> GetAssistantAsync(string assistantId, CancellationToken ct);
    Task<IReadOnlyList<PluginDefinition>> ListPublishedPluginsAsync(CancellationToken ct);
    Task<PluginDefinition?> GetPluginAsync(Guid id, CancellationToken ct);
    Task<ApiSpecDefinition?> GetApiSpecAsync(Guid id, CancellationToken ct);
    IAsyncEnumerable<RegistryEvent> SubscribeEventsAsync(CancellationToken ct);
}

/// <summary>
/// Two named HttpClients are used:
///   - "plugin-registry"        : standard resilience pipeline (retries/timeouts) for CRUD
///   - "plugin-registry-events" : resilience disabled, infinite timeout for the long-lived
///                                /events SSE subscription. Without this opt-out the standard
///                                handler's per-attempt timeout (10s) tears the SSE stream
///                                down every 10s and floods the dashboard logs.
/// </summary>
internal sealed class PluginRegistryClient(IHttpClientFactory httpFactory, ILogger<PluginRegistryClient> logger) : IPluginRegistryClient
{
    public const string CrudClientName = "plugin-registry";
    public const string EventsClientName = "plugin-registry-events";

    // Shared platform JSON options — string-enum aware, matches the producer side.
    // The producer (PluginRegistry) returns enums as their string name; deserializing
    // with the default JsonSerializerDefaults.Web options would throw on those strings
    // (default EnumConverter only accepts numbers).
    private static readonly JsonSerializerOptions Json = Extensions.PlatformHttpClientJson;

    public async Task<IReadOnlyList<AgentDefinition>> ListAgentsAsync(CancellationToken ct)
        => await httpFactory.CreateClient(CrudClientName).GetFromJsonAsync<AgentDefinition[]>("/agents", Json, ct) ?? Array.Empty<AgentDefinition>();

    public async Task<IReadOnlyList<AssistantDefinition>> ListAssistantsAsync(CancellationToken ct)
        => await httpFactory.CreateClient(CrudClientName).GetFromJsonAsync<AssistantDefinition[]>("/assistants", Json, ct) ?? Array.Empty<AssistantDefinition>();

    public Task<AssistantDefinition?> GetAssistantAsync(string assistantId, CancellationToken ct)
        => httpFactory.CreateClient(CrudClientName).GetFromJsonAsync<AssistantDefinition>($"/assistants/{Uri.EscapeDataString(assistantId)}", Json, ct);

    public async Task<IReadOnlyList<PluginDefinition>> ListPublishedPluginsAsync(CancellationToken ct)
        => await httpFactory.CreateClient(CrudClientName).GetFromJsonAsync<PluginDefinition[]>("/plugins?status=Published", Json, ct) ?? Array.Empty<PluginDefinition>();

    public Task<PluginDefinition?> GetPluginAsync(Guid id, CancellationToken ct)
        => GetOrNullAsync<PluginDefinition>($"/plugins/{id}", ct);

    public Task<ApiSpecDefinition?> GetApiSpecAsync(Guid id, CancellationToken ct)
        => GetOrNullAsync<ApiSpecDefinition>($"/apis/{id}", ct);

    /// <summary>
    /// Helper that returns null for 404 instead of throwing. The PluginRegistry returns 404
    /// for both "never existed" and "orphaned-after-reset" scenarios; either way the caller
    /// is in the better position to decide what to do (e.g. show a clear UI error, skip the
    /// plugin during reload, or trigger self-healing).
    /// </summary>
    private async Task<T?> GetOrNullAsync<T>(string url, CancellationToken ct) where T : class
    {
        var http = httpFactory.CreateClient(CrudClientName);
        using var response = await http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            logger.LogDebug("PluginRegistry GET {Url} returned 404; returning null.", url);
            return null;
        }
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<T>(Json, ct);
    }

    public async IAsyncEnumerable<RegistryEvent> SubscribeEventsAsync([EnumeratorCancellation] CancellationToken ct)
    {
        var http = httpFactory.CreateClient(EventsClientName);
        using var req = new HttpRequestMessage(HttpMethod.Get, "/events");
        req.Headers.Accept.ParseAdd("text/event-stream");
        using var resp = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
        resp.EnsureSuccessStatusCode();
        using var stream = await resp.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream, Encoding.UTF8);
        var dataBuffer = new StringBuilder();

        while (!ct.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(ct);
            if (line is null) break;
            if (line.StartsWith("data:", StringComparison.Ordinal))
            {
                if (dataBuffer.Length > 0) dataBuffer.Append('\n');
                dataBuffer.Append(line[5..].TrimStart());
            }
            else if (line.Length == 0 && dataBuffer.Length > 0)
            {
                var json = dataBuffer.ToString();
                dataBuffer.Clear();
                RegistryEvent? evt = null;
                try { evt = JsonSerializer.Deserialize<RegistryEvent>(json, Json); }
                catch (JsonException ex)
                {
                    logger.LogDebug(ex, "Skipping malformed SSE payload: {Payload}", json);
                }
                // Defensive: ignore frames where the deserialized record is missing the
                // required Type discriminator (e.g. SSE heartbeats or connection-keepalive
                // payloads with empty/partial JSON).
                if (evt is { Type: not null and not "" })
                {
                    yield return evt;
                }
                else if (evt is not null)
                {
                    logger.LogDebug("Skipping SSE event with empty Type. Raw payload: {Payload}", json);
                }
            }
        }
    }
}
