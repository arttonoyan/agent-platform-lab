using Elsa.Common.Models;
using Elsa.Workflows.Management;
using Elsa.Workflows.Management.Filters;
using Elsa.Workflows.Models;
using MarketingAnalyticsAgentLab.Shared.Abstractions;

namespace MarketingAnalyticsAgentLab.AgentRuntime.Elsa;

/// <summary>
/// Discovers published workflows that declare a <c>prompt</c> input and a
/// <c>response</c> output, wraps each one as a synthetic <see cref="AgentDescriptor"/>
/// (<see cref="AgentKind.Composite"/>), and republishes the cache into
/// <see cref="WorkflowAgentRegistry"/>.
///
/// The shape convention — declared workflow inputs/outputs named <c>prompt</c> and
/// <c>response</c> — is what lets engineers opt in: any workflow that follows it
/// appears in the Playground / Atlas / Gateway alongside simple agents, with no
/// further wiring. Workflows that don't follow the convention stay in the Automations
/// section and are still callable via their own HTTP / Timer / etc. triggers.
///
/// Refresh cadence is a periodic 10-second poll. A future iteration can subscribe to
/// Elsa's <c>WorkflowDefinitionPublished</c> / <c>WorkflowDefinitionDeleted</c>
/// mediator notifications for instant updates; polling is good enough for the POC and
/// has no failure modes related to mediator wiring order.
/// </summary>
public sealed class WorkflowAgentBridge(
    IServiceProvider services,
    WorkflowAgentRegistry registry,
    ILogger<WorkflowAgentBridge> logger) : BackgroundService
{
    public const string PromptInputName = "prompt";
    public const string ResponseOutputName = "response";
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(10);

    /// <summary>
    /// Diagnostic snapshot of every published workflow and whether it qualified as a
    /// composite agent. Surfaced via GET /agents/composite/diagnose so operators can
    /// see why a workflow they thought was an agent didn't show up in the Agents page.
    /// </summary>
    public sealed record CompositeDiagnostic(
        string DefinitionId,
        string Name,
        bool HasPromptInput,
        bool HasResponseOutput,
        IReadOnlyList<string> InputsSeen,
        IReadOnlyList<string> OutputsSeen,
        bool Promoted,
        string Reason);

    /// <summary>
    /// Run the same scan the background loop runs, but return a structured report
    /// (no caching, no registry replace). Intended for the diagnose endpoint.
    /// </summary>
    public async Task<IReadOnlyList<CompositeDiagnostic>> DiagnoseAsync(CancellationToken ct)
    {
        using var scope = services.CreateScope();
        var definitionService = scope.ServiceProvider.GetRequiredService<IWorkflowDefinitionService>();
        var graphs = await definitionService.FindWorkflowGraphsAsync(
            new WorkflowDefinitionFilter { VersionOptions = VersionOptions.Published }, ct);
        return graphs.Select(g => InspectGraph(g)).ToList();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // First refresh runs eagerly — Playground / Atlas hit /agents at app start and
        // we want composite agents available without waiting a full poll cycle.
        await RefreshAsync(stoppingToken);

        using var timer = new PeriodicTimer(PollInterval);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!await timer.WaitForNextTickAsync(stoppingToken)) break;
                await RefreshAsync(stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "WorkflowAgentBridge refresh failed; will retry on next tick.");
            }
        }
    }

    private async Task RefreshAsync(CancellationToken cancellationToken)
    {
        using var scope = services.CreateScope();
        var definitionService = scope.ServiceProvider.GetRequiredService<IWorkflowDefinitionService>();

        // VersionOptions.Published narrows to the version each workflow currently has
        // live — older versions stay in storage but aren't bridged. Matches the URL
        // operators see when they Publish.
        var filter = new WorkflowDefinitionFilter
        {
            VersionOptions = VersionOptions.Published,
        };

        var graphs = (await definitionService.FindWorkflowGraphsAsync(filter, cancellationToken)).ToList();
        var composites = new List<(AgentDescriptor Descriptor, string DefinitionId)>(graphs.Count);
        var promoted = 0;

        foreach (var graph in graphs)
        {
            var diagnostic = InspectGraph(graph);
            if (!diagnostic.Promoted)
            {
                // Log every skipped workflow so operators can see in agent-runtime
                // logs WHY their workflow didn't show up under Agents — the silent
                // path was a real footgun in early testing.
                logger.LogInformation(
                    "WorkflowAgentBridge: skipped workflow '{Name}' ({DefinitionId}) - {Reason} (inputs seen: [{Inputs}]; outputs seen: [{Outputs}])",
                    diagnostic.Name,
                    diagnostic.DefinitionId,
                    diagnostic.Reason,
                    string.Join(", ", diagnostic.InputsSeen),
                    string.Join(", ", diagnostic.OutputsSeen));
                continue;
            }

            var workflow = graph.Workflow;
            var workflowName = workflow.WorkflowMetadata.Name;
            var displayName = workflow.WorkflowMetadata.Name;
            var description = workflow.WorkflowMetadata.Description ?? string.Empty;

            // The agent name has to be a stable URL-safe identifier — workflow Name is
            // free-form so we sanitize the way AgentActivityProvider does. The browser
            // displays DisplayName, not Name, so prettiness isn't lost.
            var agentName = SanitizeName(workflowName ?? graph.Workflow.Identity.DefinitionId);

            var descriptor = new AgentDescriptor(
                Name: agentName,
                DisplayName: string.IsNullOrWhiteSpace(displayName) ? agentName : displayName,
                Description: description,
                Plugins: Array.Empty<string>(),
                Tools: Array.Empty<string>())
            {
                Kind = AgentKind.Composite,
            };

            composites.Add((descriptor, graph.Workflow.Identity.DefinitionId));
            promoted++;
        }

        registry.ReplaceAll(composites);

        if (promoted > 0)
        {
            logger.LogInformation("WorkflowAgentBridge: promoted {Count} published workflow(s) to composite agents.", promoted);
        }
        else if (graphs.Count > 0)
        {
            logger.LogInformation(
                "WorkflowAgentBridge: scanned {Count} published workflow(s); none qualify as composite agents (need a String input named 'prompt' and a String output named 'response').",
                graphs.Count);
        }
    }

    /// <summary>
    /// Inspects one published workflow graph and reports what the bridge sees.
    /// Centralised so the diagnose endpoint and the refresh loop run identical logic
    /// and any future shape-check tweak applies to both at once.
    /// </summary>
    private static CompositeDiagnostic InspectGraph(WorkflowGraph graph)
    {
        var workflow = graph.Workflow;
        var inputs = workflow.Inputs;
        var outputs = workflow.Outputs;

        var inputsSeen = inputs.Select(i => $"{i.Name}:{i.Type?.Name ?? "(null)"}").ToArray();
        var outputsSeen = outputs.Select(o => $"{o.Name}:{o.Type?.Name ?? "(null)"}").ToArray();

        var promptInput = inputs.FirstOrDefault(x =>
            string.Equals(x.Name, PromptInputName, StringComparison.OrdinalIgnoreCase));
        var responseOutput = outputs.FirstOrDefault(x =>
            string.Equals(x.Name, ResponseOutputName, StringComparison.OrdinalIgnoreCase));

        var hasPrompt = promptInput is not null && promptInput.Type == typeof(string);
        var hasResponse = responseOutput is not null && responseOutput.Type == typeof(string);

        string reason = (hasPrompt, hasResponse) switch
        {
            (true, true)   => "ok",
            (false, true)  => promptInput is null
                ? "missing input named 'prompt'"
                : $"input 'prompt' has type {promptInput.Type?.Name}, expected String",
            (true, false)  => responseOutput is null
                ? "missing output named 'response'"
                : $"output 'response' has type {responseOutput.Type?.Name}, expected String",
            (false, false) => "missing both 'prompt' (String) input and 'response' (String) output",
        };

        return new CompositeDiagnostic(
            DefinitionId: workflow.Identity.DefinitionId,
            Name: workflow.WorkflowMetadata.Name ?? "(unnamed)",
            HasPromptInput: hasPrompt,
            HasResponseOutput: hasResponse,
            InputsSeen: inputsSeen,
            OutputsSeen: outputsSeen,
            Promoted: hasPrompt && hasResponse,
            Reason: reason);
    }

    private static string SanitizeName(string name)
    {
        if (string.IsNullOrEmpty(name)) return "unnamed";
        Span<char> buffer = stackalloc char[name.Length];
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            buffer[i] = char.IsLetterOrDigit(c) ? c : '_';
        }
        return new string(buffer);
    }
}
