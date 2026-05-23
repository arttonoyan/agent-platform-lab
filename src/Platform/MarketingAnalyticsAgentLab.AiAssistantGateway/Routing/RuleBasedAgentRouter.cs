using MarketingAnalyticsAgentLab.Shared.Agents;
using MarketingAnalyticsAgentLab.Shared.Assistants;
using MarketingAnalyticsAgentLab.Shared.Interaction;

namespace MarketingAnalyticsAgentLab.AiAssistantGateway.Routing;

/// <summary>
/// Default <see cref="IAgentRouter"/>: matches the incoming message against each candidate
/// agent's <see cref="AgentDefinition.RoutingHints"/> (case-insensitive substring match) and
/// falls back to <see cref="AssistantDefinition.DefaultAgentName"/>. An LLM-classifier router
/// is a near-term swap-in noted in the README.
/// </summary>
public sealed class RuleBasedAgentRouter : IAgentRouter
{
    public Task<ResolvedAgent> SelectAsync(
        AssistantInteractionRequest request,
        AssistantDefinition assistant,
        IReadOnlyList<AgentDefinition> candidates,
        CancellationToken cancellationToken)
    {
        if (candidates.Count == 0)
        {
            throw new InvalidOperationException("Assistant has no candidate agents to route to.");
        }

        var message = request.Message ?? string.Empty;
        AgentDefinition? bestMatch = null;
        string? matchedHint = null;
        var bestScore = 0;

        foreach (var candidate in candidates)
        {
            if (candidate.RoutingHints is null) continue;
            foreach (var hint in candidate.RoutingHints)
            {
                if (string.IsNullOrWhiteSpace(hint)) continue;
                if (message.Contains(hint, StringComparison.OrdinalIgnoreCase) && hint.Length > bestScore)
                {
                    bestMatch = candidate;
                    matchedHint = hint;
                    bestScore = hint.Length;
                }
            }
        }

        if (bestMatch is not null && matchedHint is not null)
        {
            return Task.FromResult(new ResolvedAgent(
                AgentName: bestMatch.Name,
                Reason: $"matched hint '{matchedHint}' on {bestMatch.Name}"));
        }

        // Fall back to assistant's default agent, then to the first available candidate.
        var fallbackName = assistant.DefaultAgentName;
        var fallback = candidates.FirstOrDefault(c =>
            !string.IsNullOrEmpty(fallbackName) &&
            string.Equals(c.Name, fallbackName, StringComparison.OrdinalIgnoreCase))
            ?? candidates[0];

        var reason = fallback.Name == fallbackName
            ? $"no hints matched; used assistant default agent '{fallback.Name}'"
            : $"no hints matched and no default configured; used first available agent '{fallback.Name}'";

        return Task.FromResult(new ResolvedAgent(fallback.Name, reason));
    }
}
