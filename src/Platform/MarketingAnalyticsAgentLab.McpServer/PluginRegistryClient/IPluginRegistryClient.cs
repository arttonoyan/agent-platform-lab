using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using MarketingAnalyticsAgentLab.Shared.Plugins;

namespace MarketingAnalyticsAgentLab.McpServer.PluginRegistryClient;

public sealed record PluginRegistryEventDto(string Type, string? EntityId, string? DisplayName, DateTimeOffset OccurredAt);

public interface IPluginRegistryClient
{
    Task<IReadOnlyList<PluginDefinition>> ListPublishedPluginsAsync(CancellationToken ct);
    Task<ApiSpecDefinition?> GetApiSpecAsync(Guid id, CancellationToken ct);
    IAsyncEnumerable<PluginRegistryEventDto> SubscribeEventsAsync(CancellationToken ct);
}

/// <summary>
/// Two named HttpClients are used:
///   - "plugin-registry"        : standard resilience pipeline (retries/timeouts) for CRUD
///   - "plugin-registry-events" : resilience disabled, infinite timeout for the long-lived
///                                /events SSE subscription. Without this opt-out the standard
///                                handler's per-attempt timeout (10s) tears the SSE stream
///                                down every 10s and floods the dashboard logs with
///                                OnTimeout resilience events.
/// </summary>
internal sealed class PluginRegistryClient(IHttpClientFactory httpFactory, ILogger<PluginRegistryClient> logger) : IPluginRegistryClient
{
    public const string CrudClientName = "plugin-registry";
    public const string EventsClientName = "plugin-registry-events";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<PluginDefinition>> ListPublishedPluginsAsync(CancellationToken ct)
    {
        var http = httpFactory.CreateClient(CrudClientName);
        var plugins = await http.GetFromJsonAsync<PluginDefinition[]>("/plugins?status=Published", JsonOptions, ct);
        return plugins ?? Array.Empty<PluginDefinition>();
    }

    public async Task<ApiSpecDefinition?> GetApiSpecAsync(Guid id, CancellationToken ct)
    {
        // Tolerate orphaned spec references: callers (DynamicPluginToolHost.ReloadAsync) check
        // for null and skip the plugin. Without this guard the default GetFromJsonAsync would
        // throw on 404, abort the entire reload loop, and leave the McpServer with zero tools.
        var http = httpFactory.CreateClient(CrudClientName);
        using var response = await http.GetAsync($"/apis/{id}", HttpCompletionOption.ResponseHeadersRead, ct);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            logger.LogWarning("API spec {SpecId} not found in PluginRegistry (returned 404). " +
                              "Caller will treat this as a missing spec and skip the dependent plugin.", id);
            return null;
        }
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<ApiSpecDefinition>(JsonOptions, ct);
    }

    public async IAsyncEnumerable<PluginRegistryEventDto> SubscribeEventsAsync(
        [EnumeratorCancellation] CancellationToken ct)
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
                PluginRegistryEventDto? evt = null;
                try { evt = JsonSerializer.Deserialize<PluginRegistryEventDto>(json, JsonOptions); }
                catch (JsonException ex)
                {
                    logger.LogDebug(ex, "Skipping malformed SSE payload: {Payload}", json);
                }
                // Defensive: ignore frames where the deserialized record is missing the
                // required Type discriminator (e.g. SSE heartbeats or connection-keepalive
                // payloads with empty/partial JSON). Without this guard the consumer hits
                // NullReferenceException on evt.Type later.
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
