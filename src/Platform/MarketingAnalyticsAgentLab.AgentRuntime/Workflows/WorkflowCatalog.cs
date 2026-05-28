namespace MarketingAnalyticsAgentLab.AgentRuntime.Workflows;

/// <summary>
/// Declarative description of a multi-agent workflow. For the MVP, every workflow is a
/// sequential agent chain: the output of agent N becomes the input of agent N+1. The
/// runtime executes the chain end-to-end on a single request and returns per-step output
/// so the Admin Portal can render the hand-off.
///
/// This shape intentionally mirrors what a future <c>WorkflowDefinition</c> store in
/// PluginRegistry would persist (the same way agent definitions live there today). When
/// that store lands, the only change here is to source <see cref="WorkflowCatalog.List"/>
/// from the registry instead of the static built-ins below.
/// </summary>
public sealed record WorkflowDefinition(
    string Name,
    string DisplayName,
    string Description,
    IReadOnlyList<string> AgentNames);

/// <summary>
/// In-process catalog of platform workflows. Today it ships one built-in workflow
/// (Campaign Insights) that demos multi-agent orchestration; tomorrow it can read the
/// same shape from disk or PluginRegistry without touching the consumers.
/// </summary>
public sealed class WorkflowCatalog
{
    /// <summary>
    /// Built-in workflows hardcoded for the MVP demo. Keeping them here (instead of in
    /// DevUiHostingExtensions) means both DevUI and the Admin Portal read from one source
    /// of truth — adding a workflow is a single-line edit visible to both surfaces.
    /// </summary>
    public static readonly IReadOnlyList<WorkflowDefinition> BuiltIns = new WorkflowDefinition[]
    {
        new(
            Name: "CampaignInsightsWorkflow",
            DisplayName: "Campaign Insights Workflow",
            Description:
                "Sequentially runs the Marketing Analytics Agent (gathers metrics) then the " +
                "Campaign Optimization Agent (recommends concrete actions). A single prompt " +
                "yields both the data and the recommendations grounded in that data.",
            AgentNames: new[] { "MarketingAnalyticsAgent", "CampaignOptimizationAgent" }),
    };

    public IReadOnlyList<WorkflowDefinition> List() => BuiltIns;

    public WorkflowDefinition? Get(string name) =>
        BuiltIns.FirstOrDefault(w => string.Equals(w.Name, name, StringComparison.OrdinalIgnoreCase));
}
