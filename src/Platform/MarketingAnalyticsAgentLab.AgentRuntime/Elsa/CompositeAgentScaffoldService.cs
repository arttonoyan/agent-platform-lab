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
    ILogger<CompositeAgentScaffoldService> logger)
{
    public sealed record CreateCompositeAgentRequest(string Name, string? DisplayName, string? Description);

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
}
