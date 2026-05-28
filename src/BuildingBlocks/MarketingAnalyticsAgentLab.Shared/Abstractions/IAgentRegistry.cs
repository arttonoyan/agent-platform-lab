namespace MarketingAnalyticsAgentLab.Shared.Abstractions;

/// <summary>
/// Distinguishes how an agent is implemented behind the same <c>/agents/{name}/run</c>
/// REST surface. Consumers (Playground, Atlas, governance UI) treat agents uniformly,
/// but operators care about the difference: simple agents are a single LLM call with
/// attached tools; composite agents are multi-step Elsa workflows that may orchestrate
/// several other agents plus arbitrary control flow.
/// </summary>
public enum AgentKind
{
    /// <summary>One LLM call wired to a set of tools. Defined declaratively in YAML.</summary>
    Simple,
    /// <summary>
    /// A published Elsa workflow tagged as an agent. The workflow declares a
    /// <c>prompt</c> input and a <c>response</c> output; the runtime invokes it via
    /// <see cref="Elsa.Workflows.Runtime.IWorkflowInvoker"/> with the user's message
    /// bound to the prompt input and surfaces the response output as the agent reply.
    /// </summary>
    Composite,
}

/// <summary>
/// Identifying metadata for an agent. Implementations live in the Agent Runtime and wrap
/// either a concrete <c>AIAgent</c> instance (simple) or a published workflow (composite);
/// the registry abstraction is exposed here so other services (e.g. the AI Assistant
/// Gateway, governance UI, or workflow engine) can enumerate available agents without
/// taking a hard dependency on Microsoft.Agents.AI or Elsa.
/// </summary>
public sealed record AgentDescriptor(
    string Name,
    string DisplayName,
    string Description,
    IReadOnlyList<string> Plugins,
    IReadOnlyList<string> Tools)
{
    /// <summary>
    /// Implementation kind. Defaults to <see cref="AgentKind.Simple"/> for backward
    /// compatibility with the original ctor signature; the workflow bridge populates
    /// <see cref="AgentKind.Composite"/> via <c>with</c> when wrapping a published workflow.
    /// </summary>
    public AgentKind Kind { get; init; } = AgentKind.Simple;

    /// <summary>
    /// Keywords / patterns the AI Gateway's router uses to pick this agent from an
    /// assistant's allowed pool when a question matches. Same semantic as
    /// <c>AgentDefinition.RoutingHints</c> in the PluginRegistry — exposed on the live
    /// descriptor so workflow agents (which have no YAML AgentDefinition) can still
    /// declare routing hints via their workflow's CustomProperties. Default: empty,
    /// meaning the agent only wins when it's the only candidate.
    /// </summary>
    public IReadOnlyList<string> RoutingHints { get; init; } = Array.Empty<string>();
}

public interface IAgentRegistry
{
    IReadOnlyList<AgentDescriptor> List();
    AgentDescriptor? Find(string name);
}
