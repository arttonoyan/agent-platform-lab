using MarketingAnalyticsAgentLab.Shared.Plugins;

namespace MarketingAnalyticsAgentLab.McpServer.DynamicTools;

/// <summary>
/// Platform-level evaluator for the <c>Plugin Policies / Permissions</c> layer of the
/// authoring pipeline. Today's implementation is intentionally simple - it consults the
/// plugin's <see cref="PluginPermissions"/> at invocation time - but the seam is exposed
/// so a future implementation can plug in:
///
///   - per-tenant allow lists
///   - per-agent allow lists
///   - "requires approval" workflows that gate the call behind a human reviewer
///
/// The evaluator runs INSIDE the McpServer, so every agent-initiated tool call passes
/// through the same policy boundary regardless of which agent invoked it.
/// </summary>
public sealed class PluginPolicyEvaluator(ILogger<PluginPolicyEvaluator> logger)
{
    /// <summary>
    /// Returns a static decision for a plugin/agent/tenant combination. Today this is
    /// always-allow; the logging just makes the policy decision visible in OpenTelemetry
    /// traces so operators can see policy evaluations happening at the boundary.
    /// </summary>
    public PluginPolicyDecision Evaluate(PluginDefinition plugin, string? tenantId, string? agentName)
    {
        // Future: check plugin.Permissions.AllowedAgents/AllowedTenants/RequiresApproval.
        // For the demo we always allow but log the decision so the trace shows the boundary.
        logger.LogDebug("Plugin policy evaluated: plugin={Plugin} tenant={Tenant} agent={Agent} -> Allow",
            plugin.Name, tenantId ?? "(none)", agentName ?? "(unknown)");
        return PluginPolicyDecision.Allow($"policy.allow plugin={plugin.Name}");
    }
}

public sealed record PluginPolicyDecision(bool Allowed, string Reason)
{
    public static PluginPolicyDecision Allow(string reason) => new(true, reason);
    public static PluginPolicyDecision Deny(string reason) => new(false, reason);
}
