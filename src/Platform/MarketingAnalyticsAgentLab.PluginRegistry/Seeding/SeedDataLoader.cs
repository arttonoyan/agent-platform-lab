using MarketingAnalyticsAgentLab.Shared.Agents;
using MarketingAnalyticsAgentLab.Shared.Assistants;
using MarketingAnalyticsAgentLab.Shared.Plugins;

namespace MarketingAnalyticsAgentLab.PluginRegistry.Seeding;

/// <summary>
/// Ensures the registry has sensible defaults on first run: the four Marketing assistants /
/// agents / plugins demo, plus a disabled Fleet stub that proves the platform supports many
/// standalone apps.
/// </summary>
public sealed class SeedDataLoader(
    IAgentDefinitionStore agentStore,
    IAssistantRegistry assistantRegistry,
    ILogger<SeedDataLoader> logger)
    : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await SeedAssistantsAsync(cancellationToken);
        await SeedAgentsAsync(cancellationToken);
        logger.LogInformation("Plugin Registry seed data ensured.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private async Task SeedAssistantsAsync(CancellationToken ct)
    {
        var existing = await assistantRegistry.ListAsync(ct);
        if (existing.Any(a => a.AssistantId == "marketing_analytics_assistant")) return;

        await assistantRegistry.SaveAsync(new AssistantDefinition(
            AssistantId: "marketing_analytics_assistant",
            DisplayName: "Marketing Analytics Assistant",
            Application: "marketing",
            Description: "Atlas-facing assistant for the Marketing standalone app. Routes between analytics and optimization agents.",
            AgentNames: new[] { "MarketingAnalyticsAgent", "CampaignOptimizationAgent" },
            DefaultAgentName: "MarketingAnalyticsAgent",
            SystemPreamble: "You are part of the Marketing Analytics Assistant. Be concise and data-driven.",
            Enabled: true), ct);

        await assistantRegistry.SaveAsync(new AssistantDefinition(
            AssistantId: "fleet_pro_assistant",
            DisplayName: "Fleet Pro Assistant",
            Application: "fleet",
            Description: "Stub assistant for the future Fleet Pro standalone app. Disabled in this demo - present only to show the gateway supports many standalone apps.",
            AgentNames: Array.Empty<string>(),
            DefaultAgentName: null,
            SystemPreamble: null,
            Enabled: false), ct);
    }

    private async Task SeedAgentsAsync(CancellationToken ct)
    {
        var existing = await agentStore.ListAsync(ct);
        if (existing.Any(a => a.Name == "MarketingAnalyticsAgent")) return;

        // Seed the two demo agents - they have no plugin ids yet; admins must import APIs and
        // configure plugins from the Admin Portal before the agents have any tools to call.
        await agentStore.SaveAsync(new AgentDefinition(
            Id: Guid.Parse("00000000-0000-0000-0000-000000000001"),
            Name: "MarketingAnalyticsAgent",
            DisplayName: "Marketing Analytics Agent",
            Description: "Summarises campaign performance, surfaces anomalies, and explains analytics trends.",
            Instructions: """
                You are the Marketing Analytics Agent for a ServiceTitan-style marketing platform.
                - Help the user understand campaign performance: open rate, delivery rate, CTR, anomalies.
                - Always call plugin tools to get real numbers rather than guessing.
                - Quote concrete numbers and date windows in your answers.
                - Surface anomalies (sharp drops/spikes vs the trailing average) without being asked.
                Tone: concise, data-driven, professional. Avoid hedging when the data is clear.
                """,
            ModelDeployment: "gpt-4o-mini",
            PluginIds: Array.Empty<Guid>(),
            RoutingHints: new[] { "open rate", "delivery", "click", "summary", "anomaly", "trend", "engagement", "performance" }), ct);

        await agentStore.SaveAsync(new AgentDefinition(
            Id: Guid.Parse("00000000-0000-0000-0000-000000000002"),
            Name: "CampaignOptimizationAgent",
            DisplayName: "Campaign Optimization Agent",
            Description: "Proposes subject lines, segments, and send-times to lift performance based on history.",
            Instructions: """
                You are the Campaign Optimization Agent for a ServiceTitan-style marketing platform.
                - Recommend concrete optimisations for upcoming and recent campaigns.
                - Ground every recommendation in metrics from the analytics tools.
                - When asked, you may call send_campaign with dryRun=true to validate audience size;
                  NEVER call it with dryRun=false unless the user explicitly says "send it now".
                Format final answers as a short bulleted list of actions with one-sentence rationale each.
                """,
            ModelDeployment: "gpt-4o-mini",
            PluginIds: Array.Empty<Guid>(),
            RoutingHints: new[] { "optimize", "improve", "send", "low open rate", "subject line", "segment", "recommendation" }), ct);
    }

    /// <summary>
    /// Convenience: build a fresh draft plugin for every operation discovered in an OpenAPI
    /// document. The AdminPortal uses this for the "create plugin from API" wizard, but it
    /// is exposed as a static helper here so tests / seed routines can use it too.
    /// </summary>
    public static PluginDefinition CreateDraftFromOperations(
        Guid apiSpecId, string name, string description,
        IReadOnlyList<ApiOperation> operations)
    {
        var now = DateTimeOffset.UtcNow;
        var endpoints = operations.Select(op => new PluginEndpoint(
            OperationId: op.OperationId,
            Method: op.Method,
            Path: op.Path,
            ToolName: ToToolName(op.OperationId),
            ToolDescription: string.IsNullOrWhiteSpace(op.Description) ? op.Summary : op.Description,
            Parameters: op.Parameters,
            ResponseSchemaJson: op.ResponseSchemaJson)).ToArray();

        return new PluginDefinition(
            Id: Guid.NewGuid(),
            Name: name,
            DisplayName: name,
            Description: description,
            ApiSpecId: apiSpecId,
            Endpoints: endpoints,
            Auth: new PluginAuthConfig(PluginAuthType.None, null, null, null),
            Permissions: new PluginPermissions(Array.Empty<string>(), Array.Empty<string>(), false),
            Status: PluginStatus.Draft,
            CreatedAt: now,
            UpdatedAt: now);
    }

    private static string ToToolName(string operationId)
    {
        var sb = new System.Text.StringBuilder(operationId.Length + 8);
        for (var i = 0; i < operationId.Length; i++)
        {
            var c = operationId[i];
            if (char.IsUpper(c) && i > 0 && !char.IsUpper(operationId[i - 1]))
            {
                sb.Append('_');
            }
            sb.Append(char.ToLowerInvariant(c));
        }
        return sb.ToString();
    }
}
