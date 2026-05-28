using System.Net.Http.Json;
using System.Text.Json;
using MarketingAnalyticsAgentLab.ServiceDefaults;
using MarketingAnalyticsAgentLab.Shared.Agents;
using MarketingAnalyticsAgentLab.Shared.Assistants;

namespace MarketingAnalyticsAgentLab.AiAssistantGateway.Clients;

/// <summary>
/// Gateway-side view of the centralized AssistantRegistry (hosted by PluginRegistry). Reads
/// <see cref="AssistantDefinition"/>s and <see cref="AgentDefinition"/>s used to resolve which
/// agent should handle each incoming Atlas-style interaction.
/// </summary>
public interface IAssistantRegistryClient
{
    Task<AssistantDefinition?> GetAssistantAsync(string assistantId, CancellationToken ct);
    Task<IReadOnlyList<AssistantDefinition>> ListAssistantsAsync(CancellationToken ct);
    Task<IReadOnlyList<AgentDefinition>> ListAgentsAsync(CancellationToken ct);
}

internal sealed class AssistantRegistryClient(HttpClient http) : IAssistantRegistryClient
{
    // Shared platform JSON options — string-enum aware, matches the producer side.
    private static readonly JsonSerializerOptions Json = Extensions.PlatformHttpClientJson;

    public Task<AssistantDefinition?> GetAssistantAsync(string assistantId, CancellationToken ct)
        => http.GetFromJsonAsync<AssistantDefinition>($"/assistants/{Uri.EscapeDataString(assistantId)}", Json, ct);

    public async Task<IReadOnlyList<AssistantDefinition>> ListAssistantsAsync(CancellationToken ct)
        => await http.GetFromJsonAsync<AssistantDefinition[]>("/assistants", Json, ct) ?? Array.Empty<AssistantDefinition>();

    public async Task<IReadOnlyList<AgentDefinition>> ListAgentsAsync(CancellationToken ct)
        => await http.GetFromJsonAsync<AgentDefinition[]>("/agents", Json, ct) ?? Array.Empty<AgentDefinition>();
}
