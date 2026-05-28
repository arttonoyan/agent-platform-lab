using Elsa.Workflows;
using Elsa.Workflows.Activities.Flowchart.Activities;
using Elsa.Workflows.Management;
using Elsa.Workflows.Management.Models;
using Elsa.Workflows.Models;

namespace MarketingAnalyticsAgentLab.AgentRuntime.Elsa;

/// <summary>
/// Generates fully-wired Elsa workflow definitions for use as composite agents and
/// publishes them in one shot. The output is a workflow that already satisfies the
/// <see cref="WorkflowAgentBridge"/>'s contract — a String input named <c>prompt</c>
/// and a String output named <c>response</c> — so the resulting agent appears in the
/// unified Agents catalog within the bridge's next refresh cycle (≤ 10 s).
///
/// This shortcuts the entire manual authoring path in Elsa Studio (declare input,
/// declare output, drag activity, wire bindings, save, publish) down to a single
/// "+ New agent → Workflow → name + Create" interaction in the AdminPortal. Operators
/// who want to add real logic open the resulting workflow in Studio afterwards; the
/// scaffold is correct-by-construction so they can publish a v2 instantly.
///
/// Today the only template emitted is an empty Flowchart — the prompt/response
/// scaffold without any activities. Run it as-is and you'll get an empty response;
/// the value lives in eliminating the misconfigure surface (case-sensitive names,
/// missed bindings, wrong types) at creation time. The next template iteration adds
/// an opt-in "wrap one agent" mode that pre-places a configured RunAgentActivity.
/// </summary>
public sealed class CompositeAgentScaffoldService(
    IWorkflowDefinitionImporter importer,
    IWorkflowDefinitionService definitionService,
    ILogger<CompositeAgentScaffoldService> logger)
{
    // CustomProperties keys we own. Centralised so both Create/Update and the
    // WorkflowAgentBridge use the same strings — change one place, change it everywhere.
    internal const string DisplayNamePropertyKey = "compositeAgent.displayName";
    internal const string RoutingHintsPropertyKey = "compositeAgent.routingHints";

    public sealed record CreateCompositeAgentRequest(
        string Name,
        string? DisplayName,
        string? Description,
        IReadOnlyList<string>? RoutingHints);

    public sealed record UpdateCompositeAgentMetadataRequest(
        string? DisplayName,
        string? Description,
        IReadOnlyList<string>? RoutingHints);

    public sealed record CreateCompositeAgentResult(
        string DefinitionId,
        string DefinitionVersionId,
        string Name,
        string DisplayName,
        bool Published);

    public async Task<CreateCompositeAgentResult> CreateAsync(CreateCompositeAgentRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            throw new ArgumentException("Name is required.", nameof(request));

        var name = request.Name.Trim();
        var displayName = string.IsNullOrWhiteSpace(request.DisplayName) ? name : request.DisplayName.Trim();
        var description = request.Description?.Trim() ?? string.Empty;
        var routingHints = NormalizeRoutingHints(request.RoutingHints);

        // DefinitionId is the logical workflow id (stable across versions). Id is the
        // per-version id. Both are GUIDs in Studio's convention; we generate them up
        // front so the response can carry them back to the caller without a second
        // round-trip to look them up.
        var definitionId = Guid.NewGuid().ToString();
        var definitionVersionId = Guid.NewGuid().ToString();

        var model = new WorkflowDefinitionModel
        {
            Id = definitionVersionId,
            DefinitionId = definitionId,
            Name = name,
            Description = description,
            CreatedAt = DateTimeOffset.UtcNow,
            Version = 1,
            IsLatest = true,
            // Publish=true in the SaveWorkflowDefinitionRequest handles flipping this
            // and the entity-level IsPublished flag — leave it false here so the
            // importer's publish path is the single source of truth.
            IsPublished = false,
            Inputs = new List<InputDefinition>
            {
                // The two fields the WorkflowAgentBridge looks for. Names are lowercase
                // by convention so the JavaScript expressions Studio generates
                // (getInput("prompt") / getOutput("response")) match without operators
                // ever having to think about casing.
                new()
                {
                    Name = "prompt",
                    DisplayName = "Prompt",
                    Description = "The user message passed to this agent. Set by the runtime when /agents/<name>/run is called.",
                    Type = typeof(string),
                    UIHint = "single-line",
                },
            },
            Outputs = new List<OutputDefinition>
            {
                new()
                {
                    Name = "response",
                    DisplayName = "Response",
                    Description = "The agent's reply text. Written here by the final activity before the workflow ends.",
                    Type = typeof(string),
                },
            },
            Variables = new List<VariableDefinition>(),
            // DisplayName + RoutingHints aren't first-class fields on a workflow definition,
            // so we stash them in CustomProperties keyed under our own namespace. The
            // WorkflowAgentBridge reads them back and folds them into the AgentDescriptor.
            // Using a structured payload (rather than plain strings) keeps the door open
            // for richer per-agent metadata later without another schema migration.
            CustomProperties = new Dictionary<string, object>
            {
                [DisplayNamePropertyKey] = displayName,
                [RoutingHintsPropertyKey] = routingHints,
            },
            // Empty Flowchart root. Operators add the actual activities (Run Agent
            // steps, conditions, etc.) in Elsa Studio after the scaffold publishes.
            // A Flowchart with no activities is a valid runnable workflow — running it
            // ends immediately and returns an empty response.
            Root = new Flowchart
            {
                Id = Guid.NewGuid().ToString(),
                Activities = new List<IActivity>(),
            },
        };

        // Publish=true is the whole point — operators creating a composite agent want
        // it immediately consumable. If they need to iterate, Studio's draft workflow
        // becomes the active scratchpad and re-publishing bumps the version.
        var result = await importer.ImportAsync(
            new SaveWorkflowDefinitionRequest
            {
                Model = model,
                Publish = true,
            },
            cancellationToken);

        if (!result.Succeeded)
        {
            // Surface the validation errors as a single InvalidOperationException so the
            // endpoint can return 400 with the details. Without this the user just gets
            // a generic "I couldn't create the workflow" which forces a log dive.
            var errors = result.ValidationErrors is null
                ? "(no detail)"
                : string.Join("; ", result.ValidationErrors.Select(e => e.Message));
            throw new InvalidOperationException(
                $"Elsa rejected the workflow scaffold for composite agent '{name}': {errors}");
        }

        logger.LogInformation(
            "Created composite-agent scaffold '{Name}' (definitionId={DefinitionId}); the WorkflowAgentBridge will promote it on its next refresh.",
            name, definitionId);

        return new CreateCompositeAgentResult(
            DefinitionId: definitionId,
            DefinitionVersionId: result.WorkflowDefinition.Id,
            Name: name,
            DisplayName: displayName,
            Published: result.WorkflowDefinition.IsPublished);
    }

    /// <summary>
    /// Update the operator-editable metadata of an existing composite agent — display
    /// name, description, and routing hints. Activities and bindings are untouched;
    /// only the labelling and routing-router signal change. Saved as a new published
    /// version of the same DefinitionId so existing running instances keep their state
    /// and Elsa Studio shows the change in the workflow's history view.
    /// </summary>
    public async Task<CreateCompositeAgentResult> UpdateMetadataAsync(
        string definitionId,
        UpdateCompositeAgentMetadataRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(definitionId))
            throw new ArgumentException("definitionId is required.", nameof(definitionId));

        // Load the latest version we can find. Operators editing metadata expect to
        // pick up whatever's currently in Studio — published or draft — not a stale
        // snapshot. The mapper preserves the Root activity so the workflow's actual
        // flow logic survives the metadata-only update.
        var existing = await definitionService.FindWorkflowGraphAsync(
            new global::Elsa.Workflows.Management.Filters.WorkflowDefinitionFilter
            {
                DefinitionId = definitionId,
                VersionOptions = global::Elsa.Common.Models.VersionOptions.Latest,
            },
            cancellationToken);

        if (existing is null)
        {
            throw new InvalidOperationException(
                $"Composite agent workflow '{definitionId}' was not found. " +
                "Was the workflow deleted in Studio? Re-create it via + New agent → Workflow.");
        }

        var workflow = existing.Workflow;
        var displayName = string.IsNullOrWhiteSpace(request.DisplayName)
            ? workflow.WorkflowMetadata.Name ?? definitionId
            : request.DisplayName.Trim();
        var description = request.Description?.Trim() ?? workflow.WorkflowMetadata.Description ?? string.Empty;
        var routingHints = NormalizeRoutingHints(request.RoutingHints);

        // Re-emit a complete WorkflowDefinitionModel using the existing Root + Inputs +
        // Outputs + Variables, with metadata overlay applied. The importer treats this
        // as a new version under the same DefinitionId (handled by SaveDefinition).
        var model = new WorkflowDefinitionModel
        {
            Id = Guid.NewGuid().ToString(),
            DefinitionId = definitionId,
            Name = workflow.WorkflowMetadata.Name ?? definitionId,
            Description = description,
            CreatedAt = DateTimeOffset.UtcNow,
            Version = 1, // importer will bump
            IsLatest = true,
            IsPublished = false,
            Inputs = workflow.Inputs.ToList(),
            Outputs = workflow.Outputs.ToList(),
            Variables = new List<VariableDefinition>(),
            Root = workflow.Root,
            CustomProperties = new Dictionary<string, object>(workflow.CustomProperties)
            {
                [DisplayNamePropertyKey] = displayName,
                [RoutingHintsPropertyKey] = routingHints,
            },
        };

        var result = await importer.ImportAsync(
            new SaveWorkflowDefinitionRequest { Model = model, Publish = true },
            cancellationToken);

        if (!result.Succeeded)
        {
            var errors = result.ValidationErrors is null
                ? "(no detail)"
                : string.Join("; ", result.ValidationErrors.Select(e => e.Message));
            throw new InvalidOperationException(
                $"Elsa rejected the metadata update for composite agent '{definitionId}': {errors}");
        }

        logger.LogInformation(
            "Updated composite-agent metadata for '{Name}' (definitionId={DefinitionId}); bridge will refresh on the next tick.",
            displayName, definitionId);

        return new CreateCompositeAgentResult(
            DefinitionId: definitionId,
            DefinitionVersionId: result.WorkflowDefinition.Id,
            Name: result.WorkflowDefinition.Name ?? definitionId,
            DisplayName: displayName,
            Published: result.WorkflowDefinition.IsPublished);
    }

    /// <summary>
    /// Trims, dedupes (case-insensitive), and drops empty entries. Routing hints flow
    /// through JSON serialization both inbound (request) and outbound
    /// (CustomProperties storage), so a stable canonical form prevents whitespace /
    /// case drift from accumulating across edits.
    /// </summary>
    private static IReadOnlyList<string> NormalizeRoutingHints(IReadOnlyList<string>? input)
    {
        if (input is null || input.Count == 0) return Array.Empty<string>();
        return input
            .Where(h => !string.IsNullOrWhiteSpace(h))
            .Select(h => h.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }
}
