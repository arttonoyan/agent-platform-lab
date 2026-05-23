using System.Text.Json;
using MarketingAnalyticsAgentLab.Shared.Agents;
using Microsoft.Extensions.Options;

namespace MarketingAnalyticsAgentLab.PluginRegistry.Storage;

public sealed class FileSystemAgentDefinitionStore : IAgentDefinitionStore
{
    private readonly string _dir;
    private readonly Lock _gate = new();

    public FileSystemAgentDefinitionStore(IOptions<PluginRegistryOptions> options)
    {
        var opts = options.Value;
        var root = Path.GetFullPath(opts.DataDirectory, AppContext.BaseDirectory);
        _dir = Path.Combine(root, opts.AgentsFolder);
        Directory.CreateDirectory(_dir);
    }

    public Task<IReadOnlyList<AgentDefinition>> ListAsync(CancellationToken ct)
    {
        lock (_gate)
        {
            var list = new List<AgentDefinition>();
            foreach (var file in Directory.EnumerateFiles(_dir, "*.json"))
            {
                try
                {
                    var item = JsonSerializer.Deserialize<AgentDefinition>(File.ReadAllText(file), JsonSerialization.Options);
                    if (item is not null) list.Add(item);
                }
                catch (JsonException) { }
            }
            return Task.FromResult<IReadOnlyList<AgentDefinition>>(list);
        }
    }

    public Task<AgentDefinition?> GetAsync(Guid id, CancellationToken ct)
        => Task.FromResult(LoadById(id));

    public Task<AgentDefinition?> GetByNameAsync(string name, CancellationToken ct)
    {
        lock (_gate)
        {
            foreach (var file in Directory.EnumerateFiles(_dir, "*.json"))
            {
                try
                {
                    var item = JsonSerializer.Deserialize<AgentDefinition>(File.ReadAllText(file), JsonSerialization.Options);
                    if (item is not null && string.Equals(item.Name, name, StringComparison.OrdinalIgnoreCase))
                    {
                        return Task.FromResult<AgentDefinition?>(item);
                    }
                }
                catch (JsonException) { }
            }
            return Task.FromResult<AgentDefinition?>(null);
        }
    }

    public Task<AgentDefinition> SaveAsync(AgentDefinition definition, CancellationToken ct)
    {
        lock (_gate)
        {
            var path = Path.Combine(_dir, definition.Id.ToString("N") + ".json");
            File.WriteAllText(path, JsonSerializer.Serialize(definition, JsonSerialization.Options));
        }
        return Task.FromResult(definition);
    }

    public Task DeleteAsync(Guid id, CancellationToken ct)
    {
        lock (_gate)
        {
            var path = Path.Combine(_dir, id.ToString("N") + ".json");
            if (File.Exists(path)) File.Delete(path);
        }
        return Task.CompletedTask;
    }

    private AgentDefinition? LoadById(Guid id)
    {
        lock (_gate)
        {
            var path = Path.Combine(_dir, id.ToString("N") + ".json");
            if (!File.Exists(path)) return null;
            return JsonSerializer.Deserialize<AgentDefinition>(File.ReadAllText(path), JsonSerialization.Options);
        }
    }
}
