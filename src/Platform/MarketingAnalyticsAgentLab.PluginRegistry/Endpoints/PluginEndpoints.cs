using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using MarketingAnalyticsAgentLab.PluginRegistry.Events;
using MarketingAnalyticsAgentLab.PluginRegistry.OpenApi;
using MarketingAnalyticsAgentLab.PluginRegistry.Seeding;
using MarketingAnalyticsAgentLab.PluginRegistry.Storage;
using MarketingAnalyticsAgentLab.Shared.Plugins;

namespace MarketingAnalyticsAgentLab.PluginRegistry.Endpoints;

public static class PluginEndpoints
{
    public sealed record CreatePluginRequest(
        string Name,
        string DisplayName,
        string Description,
        Guid ApiSpecId,
        IReadOnlyList<string> OperationIds);

    public sealed record UpdatePluginRequest(
        string Name,
        string DisplayName,
        string Description,
        IReadOnlyList<PluginEndpoint> Endpoints,
        PluginAuthConfig Auth,
        PluginPermissions Permissions);

    public sealed record PlaygroundRequest(
        string OperationId,
        IReadOnlyDictionary<string, string?> Parameters);

    public sealed record PlaygroundResponse(
        int StatusCode,
        string? ContentType,
        string Body,
        int DurationMs);

    public static IEndpointRouteBuilder MapPluginEndpoints(this IEndpointRouteBuilder app)
    {
        var plugins = app.MapGroup("/plugins").WithTags("Plugins");

        plugins.MapGet("/", async (IPluginRegistryStore store, PluginStatus? status, CancellationToken ct)
            => await store.ListPluginsAsync(status, ct))
        .WithName("ListPlugins")
        .WithSummary("List plugin definitions, optionally filtered by status.");

        plugins.MapGet("/{id:guid}", async (IPluginRegistryStore store, Guid id, CancellationToken ct)
            => await store.GetPluginAsync(id, ct) is { } p ? Results.Ok(p) : Results.NotFound())
        .WithName("GetPlugin");

        plugins.MapPost("/", async (
            CreatePluginRequest request,
            IPluginRegistryStore store,
            CancellationToken ct) =>
        {
            var spec = await store.GetApiSpecAsync(request.ApiSpecId, ct);
            if (spec is null) return Results.BadRequest(new { error = "Unknown apiSpecId" });

            var allOperations = OpenApiOperationParser.Parse(spec.OpenApiDocument);
            var selected = allOperations
                .Where(o => request.OperationIds.Contains(o.OperationId, StringComparer.OrdinalIgnoreCase))
                .ToArray();
            if (selected.Length == 0)
            {
                return Results.BadRequest(new { error = "No matching operations found." });
            }

            var plugin = SeedDataLoader.CreateDraftFromOperations(
                request.ApiSpecId, request.Name, request.Description, selected) with
            {
                DisplayName = request.DisplayName,
            };
            await store.SavePluginAsync(plugin, ct);
            return Results.Created($"/plugins/{plugin.Id}", plugin);
        })
        .WithName("CreatePlugin")
        .WithSummary("Create a draft plugin from selected operations of an imported API spec.");

        plugins.MapPut("/{id:guid}", async (
            Guid id,
            UpdatePluginRequest request,
            IPluginRegistryStore store,
            CancellationToken ct) =>
        {
            var existing = await store.GetPluginAsync(id, ct);
            if (existing is null) return Results.NotFound();
            var updated = existing with
            {
                Name = request.Name,
                DisplayName = request.DisplayName,
                Description = request.Description,
                Endpoints = request.Endpoints,
                Auth = request.Auth,
                Permissions = request.Permissions,
                UpdatedAt = DateTimeOffset.UtcNow,
            };
            await store.SavePluginAsync(updated, ct);
            return Results.Ok(updated);
        })
        .WithName("UpdatePlugin");

        plugins.MapPost("/{id:guid}/publish", async (
            Guid id,
            IPluginRegistryStore store,
            PluginRegistryEventBus bus,
            CancellationToken ct) =>
        {
            var existing = await store.GetPluginAsync(id, ct);
            if (existing is null) return Results.NotFound();
            var published = existing with { Status = PluginStatus.Published, UpdatedAt = DateTimeOffset.UtcNow };
            await store.SavePluginAsync(published, ct);
            bus.Publish(new PluginRegistryEvent("plugin.published", id.ToString(), published.DisplayName, DateTimeOffset.UtcNow));
            return Results.Ok(published);
        })
        .WithName("PublishPlugin");

        plugins.MapPost("/{id:guid}/unpublish", async (
            Guid id,
            IPluginRegistryStore store,
            PluginRegistryEventBus bus,
            CancellationToken ct) =>
        {
            var existing = await store.GetPluginAsync(id, ct);
            if (existing is null) return Results.NotFound();
            var draft = existing with { Status = PluginStatus.Draft, UpdatedAt = DateTimeOffset.UtcNow };
            await store.SavePluginAsync(draft, ct);
            bus.Publish(new PluginRegistryEvent("plugin.unpublished", id.ToString(), draft.DisplayName, DateTimeOffset.UtcNow));
            return Results.Ok(draft);
        })
        .WithName("UnpublishPlugin");

        plugins.MapDelete("/{id:guid}", async (
            Guid id,
            IPluginRegistryStore store,
            PluginRegistryEventBus bus,
            CancellationToken ct) =>
        {
            await store.DeletePluginAsync(id, ct);
            bus.Publish(new PluginRegistryEvent("plugin.deleted", id.ToString(), null, DateTimeOffset.UtcNow));
            return Results.NoContent();
        })
        .WithName("DeletePlugin");

        plugins.MapPost("/{id:guid}/playground", async (
            Guid id,
            PlaygroundRequest request,
            IPluginRegistryStore store,
            IHttpClientFactory httpFactory,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var plugin = await store.GetPluginAsync(id, ct);
            if (plugin is null) return Results.NotFound();
            var endpoint = plugin.Endpoints.FirstOrDefault(e => string.Equals(e.OperationId, request.OperationId, StringComparison.OrdinalIgnoreCase));
            if (endpoint is null) return Results.BadRequest(new { error = $"Operation '{request.OperationId}' not found on plugin." });

            // Resolve the api-spec the plugin points at, with a self-healing fallback. The
            // referenced spec id can become orphaned when the data/api-specs/ folder is
            // re-imported under fresh ids (we've seen this in practice when developers reset
            // the data directory between sessions). When the direct lookup fails, scan all
            // specs and match by the union of plugin operation ids - whichever spec contains
            // them all is the correct one, and we re-link the plugin in place so the next
            // call uses the fast path. Doing it here keeps the existing plugin file usable
            // without forcing the operator to delete and recreate it from scratch.
            var spec = await ResolveSpecAsync(plugin, store, loggerFactory.CreateLogger("PluginRegistry.Playground"), ct);
            if (spec is null)
            {
                return Results.Problem(
                    detail: "API spec missing for this plugin and no imported spec contains all of its operations. " +
                            "Open the Admin Portal -> APIs and re-import the underlying API, then recreate the plugin.",
                    statusCode: 409,
                    title: "Orphaned plugin");
            }

            using var http = httpFactory.CreateClient("playground");
            http.BaseAddress = spec.BaseAddress;

            var sw = System.Diagnostics.Stopwatch.StartNew();
            var response = await ExecuteAsync(http, endpoint, plugin.Auth, request.Parameters, ct);
            sw.Stop();
            var content = await response.Content.ReadAsStringAsync(ct);

            return Results.Ok(new PlaygroundResponse(
                StatusCode: (int)response.StatusCode,
                ContentType: response.Content.Headers.ContentType?.ToString(),
                Body: content,
                DurationMs: (int)sw.ElapsedMilliseconds));
        })
        .WithName("RunPluginPlayground")
        .WithSummary("Issue the real HTTP call described by the plugin endpoint and return the raw response.");

        return app;
    }

    private static async Task<HttpResponseMessage> ExecuteAsync(
        HttpClient http,
        PluginEndpoint endpoint,
        PluginAuthConfig auth,
        IReadOnlyDictionary<string, string?> parameters,
        CancellationToken ct)
    {
        var path = endpoint.Path;
        var query = new List<string>();
        var headers = new List<(string, string)>();
        string? bodyJson = null;

        foreach (var param in endpoint.Parameters)
        {
            if (!parameters.TryGetValue(param.Name, out var value) || value is null) continue;
            switch (param.In)
            {
                case PluginParameterLocation.Path:
                    path = path.Replace("{" + param.Name + "}", Uri.EscapeDataString(value), StringComparison.Ordinal);
                    break;
                case PluginParameterLocation.Query:
                    query.Add($"{Uri.EscapeDataString(param.Name)}={Uri.EscapeDataString(value)}");
                    break;
                case PluginParameterLocation.Header:
                    headers.Add((param.Name, value));
                    break;
                case PluginParameterLocation.Body:
                    bodyJson = value;
                    break;
            }
        }

        if (query.Count > 0)
        {
            path += (path.Contains('?', StringComparison.Ordinal) ? "&" : "?") + string.Join("&", query);
        }

        using var req = new HttpRequestMessage(new HttpMethod(endpoint.Method), path);
        foreach (var (name, value) in headers)
        {
            req.Headers.TryAddWithoutValidation(name, value);
        }
        if (bodyJson is not null)
        {
            req.Content = new StringContent(bodyJson, Encoding.UTF8, "application/json");
        }

        if (auth.Type != PluginAuthType.None && !string.IsNullOrWhiteSpace(auth.HeaderName))
        {
            var secret = Environment.GetEnvironmentVariable(auth.SecretName ?? "") ?? "";
            req.Headers.TryAddWithoutValidation(auth.HeaderName, auth.Type == PluginAuthType.Bearer ? $"Bearer {secret}" : secret);
        }

        return await http.SendAsync(req, ct);
    }

    /// <summary>
    /// Resolves the <see cref="ApiSpecDefinition"/> that backs a plugin. The fast path is a
    /// direct lookup by <see cref="PluginDefinition.ApiSpecId"/>; if that returns null (e.g.
    /// the spec was re-imported under a fresh id and the plugin's reference is stale), the
    /// method falls back to scanning every imported spec and finding one whose operation set
    /// contains every operation the plugin claims. On a successful fallback the plugin is
    /// updated in place so the next call hits the fast path.
    /// </summary>
    private static async Task<ApiSpecDefinition?> ResolveSpecAsync(
        PluginDefinition plugin,
        IPluginRegistryStore store,
        ILogger logger,
        CancellationToken ct)
    {
        var direct = await store.GetApiSpecAsync(plugin.ApiSpecId, ct);
        if (direct is not null) return direct;

        logger.LogWarning(
            "Plugin {Plugin} ({Id}) references api-spec {ApiSpec} but that spec is not on disk. " +
            "Attempting self-heal by matching operation ids against all imported specs.",
            plugin.Name, plugin.Id, plugin.ApiSpecId);

        var requiredOps = plugin.Endpoints
            .Select(e => e.OperationId)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (requiredOps.Count == 0) return null;

        var allSpecs = await store.ListApiSpecsAsync(ct);
        foreach (var candidate in allSpecs)
        {
            IReadOnlyList<ApiOperation> operations;
            try { operations = OpenApiOperationParser.Parse(candidate.OpenApiDocument); }
            catch { continue; }

            var candidateOps = operations
                .Select(o => o.OperationId)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            if (requiredOps.IsSubsetOf(candidateOps))
            {
                logger.LogInformation(
                    "Re-linking plugin {Plugin} ({Id}) from orphaned api-spec {Old} to {New} ({Service}).",
                    plugin.Name, plugin.Id, plugin.ApiSpecId, candidate.Id, candidate.ServiceName);

                var healed = plugin with { ApiSpecId = candidate.Id, UpdatedAt = DateTimeOffset.UtcNow };
                await store.SavePluginAsync(healed, ct);
                return candidate;
            }
        }

        logger.LogError(
            "No imported api-spec contains all operations of plugin {Plugin} ({Id}). " +
            "Operator must re-import the underlying API and recreate the plugin.",
            plugin.Name, plugin.Id);
        return null;
    }
}
