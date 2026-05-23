using System.Text.Json;
using MarketingAnalyticsAgentLab.AgentRuntime.Agents;
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Hosting;
using Microsoft.Agents.AI.Hosting.OpenAI;
using Microsoft.Agents.AI.Workflows;
using Microsoft.Extensions.DependencyInjection;

namespace MarketingAnalyticsAgentLab.AgentRuntime.DevUi;

/// <summary>
/// Wires the Microsoft Agent Framework <c>DevUI</c> dashboard into the AgentRuntime host.
/// DevUI is positioned as the platform's primary runtime debugging surface for:
///  - workflow execution visualization
///  - OpenTelemetry trace inspection
///  - tool-call inspection and orchestration debugging
///
/// The dashboard is served at <c>/devui</c> alongside an OpenAI-compatible API at <c>/v1/*</c>
/// (responses + conversations). Both are intended for development environments only.
///
/// Limitation (temporary): the official .NET DevUI package expects agents and workflows to be
/// registered at host build time via
/// <see cref="HostApplicationBuilderAgentExtensions.AddAIAgent(IHostApplicationBuilder, string, Func{IServiceProvider, string, AIAgent})"/>
/// and <c>AddSequentialWorkflow</c>. Our platform builds agents dynamically from
/// PluginRegistry definitions, so we read the on-disk agent JSON files at startup, pre-register
/// one factory per agent name, and have each factory pull the LIVE agent from
/// <see cref="RuntimeAgentRegistry"/> on each invocation. Plugin/tool reloads remain dynamic;
/// only the SET of discoverable agents is captured at startup. Agents added later via the
/// Admin Portal require an AgentRuntime restart to appear in DevUI.
/// </summary>
public static class DevUiHostingExtensions
{
    /// <summary>
    /// Fallback agent names used when the on-disk agent-definitions folder is empty or
    /// unreadable (e.g. cold start before the PluginRegistry has seeded anything).
    /// </summary>
    private static readonly IReadOnlyList<string> SeedAgentNames = new[]
    {
        "MarketingAnalyticsAgent",
        "CampaignOptimizationAgent",
    };

    /// <summary>
    /// Registers DevUI services, one <see cref="AIAgent"/> factory per agent definition
    /// discovered on disk, plus a built-in sequential workflow that chains analytics into
    /// optimization for runtime inspection in DevUI.
    /// Call this from the AgentRuntime's host builder, before <c>Build()</c>.
    /// </summary>
    public static IHostApplicationBuilder AddPlatformDevUi(this IHostApplicationBuilder builder)
    {
        // OpenAI-compatible Responses + Conversations services are the API surface DevUI's
        // frontend talks to. The DevUI package does not auto-register them, so do it here
        // before AddDevUI() to avoid runtime IResponsesService resolution errors.
        builder.Services.AddOpenAIResponses();
        builder.Services.AddOpenAIConversations();

        builder.AddDevUI();

        // Discover every agent name from the shared data folder PluginRegistry writes to.
        // This lets newly-created agents show up in DevUI after an AgentRuntime restart,
        // without any code change.
        var agentNames = DiscoverAgentNames(builder.Configuration);

        var hostedBuilders = new Dictionary<string, IHostedAgentBuilder>(StringComparer.OrdinalIgnoreCase);
        foreach (var name in agentNames)
        {
            hostedBuilders[name] = builder.AddAIAgent(name, (services, key) =>
            {
                var registry = services.GetRequiredService<RuntimeAgentRegistry>();
                if (registry.TryGet(key, out var agent) && agent is not null)
                {
                    return agent;
                }
                throw new InvalidOperationException(
                    $"Agent '{key}' is not yet loaded by AgentLifecycleService. " +
                    "Ensure PluginRegistry is reachable and Azure OpenAI is configured, then retry.");
            });
        }

        // Demo workflow: chain the analytics agent into the optimization agent so DevUI shows
        // a multi-agent orchestration alongside the individual agents. The workflow runs
        // end-to-end on a single DevUI invocation; the dashboard renders step-by-step output
        // from each agent plus the OpenTelemetry spans for the full execution.
        // For runtime-editable workflows, this is the seam where a future WorkflowDefinition
        // store from PluginRegistry can be enumerated the same way as agents above.
        if (hostedBuilders.ContainsKey("MarketingAnalyticsAgent") &&
            hostedBuilders.ContainsKey("CampaignOptimizationAgent"))
        {
            builder.AddWorkflow("CampaignInsightsWorkflow", (services, name) =>
            {
                var registry = services.GetRequiredService<RuntimeAgentRegistry>();
                if (!registry.TryGet("MarketingAnalyticsAgent", out var analytics) || analytics is null ||
                    !registry.TryGet("CampaignOptimizationAgent", out var optimization) || optimization is null)
                {
                    throw new InvalidOperationException(
                        "CampaignInsightsWorkflow requires MarketingAnalyticsAgent and CampaignOptimizationAgent " +
                        "to be loaded. Ensure PluginRegistry is reachable and Azure OpenAI is configured.");
                }
                return AgentWorkflowBuilder.BuildSequential(
                    name,
                    new[] { analytics, optimization });
            });
        }

        return builder;
    }

    /// <summary>
    /// Reads every <c>{name}.json</c> in the shared data folder and returns the discovered
    /// agent names. Falls back to <see cref="SeedAgentNames"/> if the folder is missing
    /// or empty.
    /// </summary>
    private static IReadOnlyList<string> DiscoverAgentNames(IConfiguration config)
    {
        var dataDir = config["AgentRuntime:DataDirectory"] ?? "../../../../../../data";
        var fullPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, dataDir, "agent-definitions"));

        if (!Directory.Exists(fullPath))
        {
            return SeedAgentNames;
        }

        var names = new List<string>();
        foreach (var file in Directory.EnumerateFiles(fullPath, "*.json"))
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(file));
                if (doc.RootElement.TryGetProperty("name", out var nameEl)
                    && nameEl.ValueKind == JsonValueKind.String
                    && nameEl.GetString() is { Length: > 0 } name)
                {
                    names.Add(name);
                }
            }
            catch (JsonException)
            {
                // Skip malformed files - they'll show up in PluginRegistry's logs separately.
            }
        }

        return names.Count > 0 ? names : SeedAgentNames;
    }
}
