using Elsa.Workflows;
using Elsa.Workflows.Models;
using MarketingAnalyticsAgentLab.Shared.Abstractions;

namespace MarketingAnalyticsAgentLab.AgentRuntime.Elsa;

/// <summary>
/// Emits one Elsa <see cref="ActivityDescriptor"/> per registered agent so each agent
/// appears as its own draggable item under the "Agents" category in Studio's activity
/// palette. The descriptor's <c>Constructor</c> instantiates a <see cref="RunAgentActivity"/>
/// (the shared CLR backing type) with its <c>Type</c> property set to
/// <c>"Agents.{agentName}"</c>; at execution time <see cref="RunAgentActivity"/> recovers
/// the agent name from that field and dispatches to the live <c>RuntimeAgentRegistry</c>.
///
/// This provider is the SOLE source of descriptors for <see cref="RunAgentActivity"/> —
/// the CLR type carries no <c>[Activity]</c> attribute and is not registered via
/// <c>elsa.AddActivity</c>, so the only descriptors Elsa knows about for it are the
/// per-agent ones produced here. That keeps a confusing generic "Run Agent" entry out
/// of the palette.
///
/// Studio caches the descriptor list, so additions/removals only show up after
/// <see cref="IActivityRegistry.RefreshDescriptorsAsync(Elsa.Workflows.IActivityProvider,System.Threading.CancellationToken)"/>
/// is invoked — <see cref="ActivityRegistryRefreshOnAgentChange"/> does that whenever
/// the AgentLifecycleService rebuilds the agent set.
/// </summary>
public sealed class AgentActivityProvider(
    IAgentRegistry agentRegistry,
    IActivityDescriber activityDescriber) : IActivityProvider
{
    public const string Category = "Agents";
    public const string TypeNamePrefix = "Agents.";

    public async ValueTask<IEnumerable<ActivityDescriptor>> GetDescriptorsAsync(CancellationToken cancellationToken = default)
    {
        var agents = agentRegistry.List();
        var descriptors = new List<ActivityDescriptor>(agents.Count);

        foreach (var agent in agents)
        {
            // DescribeActivityAsync inspects RunAgentActivity's [Input] / [Output]
            // attributes and produces a baseline descriptor (Inputs/Outputs/Ports). We
            // then overlay per-agent identity (TypeName, DisplayName, Category, etc.)
            // and the Constructor delegate that stamps the typename onto each instance.
            var descriptor = await activityDescriber.DescribeActivityAsync(typeof(RunAgentActivity), cancellationToken);

            var sanitized = SanitizeName(agent.Name);
            var typeName = TypeNamePrefix + sanitized;

            descriptor.TypeName = typeName;
            descriptor.Namespace = "Agents";
            descriptor.Name = sanitized;
            descriptor.DisplayName = string.IsNullOrWhiteSpace(agent.DisplayName) ? agent.Name : agent.DisplayName;
            descriptor.Description = BuildDescription(agent);
            descriptor.Category = Category;
            descriptor.IsBrowsable = true;

            descriptor.Constructor = context =>
            {
                // Elsa 3.7 API: the constructor returns an ActivityConstructionResult
                // (replaces the obsolete IActivityFactory.Create<T>). CreateActivity<T>
                // on the ConstructorContext both instantiates the typed activity and
                // packages any deserialization exceptions for the diagnostic surface.
                var result = context.CreateActivity<RunAgentActivity>();
                // Stamping Type on the instance is what lets RunAgentActivity.ExecuteAsync
                // recover the agent name at run time (see ExtractAgentNameFromType).
                result.Activity.Type = typeName;
                return result;
            };

            descriptors.Add(descriptor);
        }

        return descriptors;
    }

    /// <summary>
    /// TypeName has to be a stable ASCII identifier (the designer round-trips it through
    /// JSON without quoting). Replace anything that isn't a letter/digit with '_' so
    /// agent display names containing spaces or punctuation still produce a valid name.
    /// </summary>
    private static string SanitizeName(string name)
    {
        Span<char> buffer = stackalloc char[name.Length];
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            buffer[i] = char.IsLetterOrDigit(c) ? c : '_';
        }
        return new string(buffer);
    }

    private static string BuildDescription(AgentDescriptor agent)
    {
        var baseDesc = string.IsNullOrWhiteSpace(agent.Description)
            ? $"Calls the '{agent.Name}' agent with the given prompt."
            : agent.Description;

        if (agent.Plugins is { Count: > 0 })
        {
            baseDesc += " Tools: " + string.Join(", ", agent.Plugins) + ".";
        }
        return baseDesc;
    }
}
