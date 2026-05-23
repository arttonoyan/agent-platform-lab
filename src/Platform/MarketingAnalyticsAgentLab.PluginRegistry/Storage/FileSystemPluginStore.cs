using System.Text.Json;
using MarketingAnalyticsAgentLab.Shared.Plugins;
using Microsoft.Extensions.Options;

namespace MarketingAnalyticsAgentLab.PluginRegistry.Storage;

/// <summary>
/// File-system implementation of <see cref="IPluginRegistryStore"/>. Each entity is stored as
/// a single JSON file under <c>{DataDirectory}/{folder}/{id}.json</c>. Concurrent writes are
/// guarded by a per-folder lock; on first use the directory tree is created on demand.
/// </summary>
public sealed class FileSystemPluginStore : IPluginRegistryStore
{
    private readonly string _apiSpecsDir;
    private readonly string _pluginsDir;
    private readonly Lock _apiSpecsLock = new();
    private readonly Lock _pluginsLock = new();

    public FileSystemPluginStore(IOptions<PluginRegistryOptions> options)
    {
        var opts = options.Value;
        var root = Path.GetFullPath(opts.DataDirectory, AppContext.BaseDirectory);
        _apiSpecsDir = Path.Combine(root, opts.ApiSpecsFolder);
        _pluginsDir = Path.Combine(root, opts.PluginsFolder);
        Directory.CreateDirectory(_apiSpecsDir);
        Directory.CreateDirectory(_pluginsDir);
    }

    public Task<IReadOnlyList<ApiSpecDefinition>> ListApiSpecsAsync(CancellationToken ct)
        => Task.FromResult<IReadOnlyList<ApiSpecDefinition>>(LoadAll<ApiSpecDefinition>(_apiSpecsDir, _apiSpecsLock));

    public Task<ApiSpecDefinition?> GetApiSpecAsync(Guid id, CancellationToken ct)
        => Task.FromResult(LoadOne<ApiSpecDefinition>(_apiSpecsDir, id.ToString("N"), _apiSpecsLock));

    public Task<ApiSpecDefinition> SaveApiSpecAsync(ApiSpecDefinition spec, CancellationToken ct)
    {
        SaveOne(_apiSpecsDir, spec.Id.ToString("N"), spec, _apiSpecsLock);
        return Task.FromResult(spec);
    }

    public Task DeleteApiSpecAsync(Guid id, CancellationToken ct)
    {
        var path = Path.Combine(_apiSpecsDir, id.ToString("N") + ".json");
        lock (_apiSpecsLock)
        {
            if (File.Exists(path)) File.Delete(path);
        }
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<PluginDefinition>> ListPluginsAsync(PluginStatus? statusFilter, CancellationToken ct)
    {
        var all = LoadAll<PluginDefinition>(_pluginsDir, _pluginsLock);
        if (statusFilter is null)
        {
            return Task.FromResult<IReadOnlyList<PluginDefinition>>(all);
        }
        return Task.FromResult<IReadOnlyList<PluginDefinition>>(
            all.Where(p => p.Status == statusFilter).ToArray());
    }

    public Task<PluginDefinition?> GetPluginAsync(Guid id, CancellationToken ct)
        => Task.FromResult(LoadOne<PluginDefinition>(_pluginsDir, id.ToString("N"), _pluginsLock));

    public Task<PluginDefinition> SavePluginAsync(PluginDefinition plugin, CancellationToken ct)
    {
        SaveOne(_pluginsDir, plugin.Id.ToString("N"), plugin, _pluginsLock);
        return Task.FromResult(plugin);
    }

    public Task DeletePluginAsync(Guid id, CancellationToken ct)
    {
        var path = Path.Combine(_pluginsDir, id.ToString("N") + ".json");
        lock (_pluginsLock)
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        return Task.CompletedTask;
    }

    private static List<T> LoadAll<T>(string dir, Lock gate) where T : class
    {
        lock (gate)
        {
            var list = new List<T>();
            foreach (var file in Directory.EnumerateFiles(dir, "*.json"))
            {
                try
                {
                    var json = File.ReadAllText(file);
                    var item = JsonSerializer.Deserialize<T>(json, JsonSerialization.Options);
                    if (item is not null)
                    {
                        list.Add(item);
                    }
                }
                catch (JsonException) { /* skip malformed */ }
            }
            return list;
        }
    }

    private static T? LoadOne<T>(string dir, string name, Lock gate) where T : class
    {
        lock (gate)
        {
            var path = Path.Combine(dir, name + ".json");
            if (!File.Exists(path)) return null;
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<T>(json, JsonSerialization.Options);
        }
    }

    private static void SaveOne<T>(string dir, string name, T value, Lock gate)
    {
        lock (gate)
        {
            var path = Path.Combine(dir, name + ".json");
            var json = JsonSerializer.Serialize(value, JsonSerialization.Options);
            File.WriteAllText(path, json);
        }
    }
}
