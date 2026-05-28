using System.Net.Http.Json;
using System.Text.Json;
using MarketingAnalyticsAgentLab.ServiceDefaults;
using MarketingAnalyticsAgentLab.Shared.Abstractions;
using MarketingAnalyticsAgentLab.Shared.Interaction;

namespace MarketingAnalyticsAgentLab.AiAssistantGateway.Clients;

public interface IAgentRuntimeClient
{
    Task<IReadOnlyList<AgentDescriptor>> ListAgentsAsync(CancellationToken ct);
    Task<AgentRunResponse> RunAsync(string agentName, AgentRunRequest request, CancellationToken ct);
}

internal sealed class AgentRuntimeClient(HttpClient http) : IAgentRuntimeClient
{
    // Shared platform JSON options — string-enum aware. AgentDescriptor carries the
    // AgentKind enum which the agent-runtime serializes as "Simple"/"Composite"; the
    // default deserializer rejects those strings.
    private static readonly JsonSerializerOptions Json = Extensions.PlatformHttpClientJson;

    public async Task<IReadOnlyList<AgentDescriptor>> ListAgentsAsync(CancellationToken ct)
        => await http.GetFromJsonAsync<AgentDescriptor[]>("/agents", Json, ct) ?? Array.Empty<AgentDescriptor>();

    public async Task<AgentRunResponse> RunAsync(string agentName, AgentRunRequest request, CancellationToken ct)
    {
        using var resp = await http.PostAsJsonAsync($"/agents/{Uri.EscapeDataString(agentName)}/run", request, Json, ct);
        resp.EnsureSuccessStatusCode();
        return (await resp.Content.ReadFromJsonAsync<AgentRunResponse>(Json, ct))
            ?? throw new InvalidOperationException("AgentRuntime returned an empty body.");
    }
}
