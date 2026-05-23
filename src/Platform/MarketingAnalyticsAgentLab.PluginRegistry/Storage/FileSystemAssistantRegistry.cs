using System.Text.Json;
using MarketingAnalyticsAgentLab.Shared.Assistants;
using Microsoft.Extensions.Options;

namespace MarketingAnalyticsAgentLab.PluginRegistry.Storage;

/// <summary>
/// File-system-backed <see cref="IAssistantRegistry"/>. Each assistant lives in
/// <c>{DataDirectory}/assistants/{assistantId}.json</c>. The store can be swapped for a
/// database implementation without changing any of the platform's call sites.
/// </summary>
public sealed class FileSystemAssistantRegistry : IAssistantRegistry
{
    private readonly string _dir;
    private readonly Lock _gate = new();

    public FileSystemAssistantRegistry(IOptions<PluginRegistryOptions> options)
    {
        var opts = options.Value;
        var root = Path.GetFullPath(opts.DataDirectory, AppContext.BaseDirectory);
        _dir = Path.Combine(root, opts.AssistantsFolder);
        Directory.CreateDirectory(_dir);
    }

    public Task<IReadOnlyList<AssistantDefinition>> ListAsync(CancellationToken ct)
    {
        lock (_gate)
        {
            var list = new List<AssistantDefinition>();
            foreach (var file in Directory.EnumerateFiles(_dir, "*.json"))
            {
                try
                {
                    var item = JsonSerializer.Deserialize<AssistantDefinition>(File.ReadAllText(file), JsonSerialization.Options);
                    if (item is not null) list.Add(item);
                }
                catch (JsonException) { }
            }
            return Task.FromResult<IReadOnlyList<AssistantDefinition>>(list);
        }
    }

    public Task<AssistantDefinition?> GetAsync(string assistantId, CancellationToken ct)
    {
        lock (_gate)
        {
            var path = Path.Combine(_dir, Sanitize(assistantId) + ".json");
            if (!File.Exists(path)) return Task.FromResult<AssistantDefinition?>(null);
            return Task.FromResult(JsonSerializer.Deserialize<AssistantDefinition>(File.ReadAllText(path), JsonSerialization.Options));
        }
    }

    public Task<AssistantDefinition> SaveAsync(AssistantDefinition assistant, CancellationToken ct)
    {
        lock (_gate)
        {
            var path = Path.Combine(_dir, Sanitize(assistant.AssistantId) + ".json");
            File.WriteAllText(path, JsonSerializer.Serialize(assistant, JsonSerialization.Options));
        }
        return Task.FromResult(assistant);
    }

    public Task DeleteAsync(string assistantId, CancellationToken ct)
    {
        lock (_gate)
        {
            var path = Path.Combine(_dir, Sanitize(assistantId) + ".json");
            if (File.Exists(path)) File.Delete(path);
        }
        return Task.CompletedTask;
    }

    private static string Sanitize(string id)
    {
        var safe = new string(id.Select(c => char.IsLetterOrDigit(c) || c is '-' or '_' ? c : '_').ToArray());
        return safe.ToLowerInvariant();
    }
}
