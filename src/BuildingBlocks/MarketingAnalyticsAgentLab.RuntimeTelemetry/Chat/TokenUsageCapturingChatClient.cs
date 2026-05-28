using System.Collections.Immutable;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.AI;

namespace MarketingAnalyticsAgentLab.RuntimeTelemetry.Chat;

/// <summary>
/// <see cref="DelegatingChatClient"/> that captures token usage from every chat completion
/// flowing through it and folds it into every active ambient <see cref="TokenUsageAccumulator"/>.
/// Accumulators are published via an <c>AsyncLocal</c> stack so nested scopes — e.g. a
/// workflow-level accumulator wrapping an activity-level accumulator wrapping an agent run —
/// all see the same data without any caller threading state through.
///
/// Stacking matters for composite (workflow-backed) agents: the outer scope in
/// AgentRunEndpoints captures the workflow's TOTAL token cost; each RunAgentActivity inside
/// the workflow opens its own inner scope for per-step JournalData. Without stacking, the
/// inner scope would overwrite the AsyncLocal and the outer accumulator would observe zero
/// — which is exactly the bug this class was originally written without protecting against.
///
/// Pattern follows Microsoft.Extensions.AI's middleware guidance: wrap the inner
/// <c>IChatClient</c> in a builder pipeline, observe every response, and pass the data
/// through unchanged.
/// </summary>
public sealed class TokenUsageCapturingChatClient(IChatClient inner) : DelegatingChatClient(inner)
{
    private static readonly AsyncLocal<ImmutableList<TokenUsageAccumulator>?> Current = new();

    /// <summary>
    /// Publishes the accumulator on the current async flow. Dispose to pop it back off.
    /// Calls made inside this scope (including nested LLM turns from agent tool loops) are
    /// observed by THIS accumulator AND every accumulator established by enclosing
    /// scopes. Safe to nest arbitrarily.
    /// </summary>
    public static IDisposable Capture(TokenUsageAccumulator accumulator)
    {
        ArgumentNullException.ThrowIfNull(accumulator);
        var previous = Current.Value;
        Current.Value = (previous ?? ImmutableList<TokenUsageAccumulator>.Empty).Add(accumulator);
        return new Releaser(previous);
    }

    public override async Task<ChatResponse> GetResponseAsync(
        IEnumerable<ChatMessage> messages,
        ChatOptions? options = null,
        CancellationToken cancellationToken = default)
    {
        var response = await base.GetResponseAsync(messages, options, cancellationToken).ConfigureAwait(false);
        Capture(response);
        return response;
    }

    public override async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(
        IEnumerable<ChatMessage> messages,
        ChatOptions? options = null,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await foreach (var update in base.GetStreamingResponseAsync(messages, options, cancellationToken)
            .ConfigureAwait(false))
        {
            Capture(update);
            yield return update;
        }
    }

    private static void Capture(ChatResponse response)
    {
        var stack = Current.Value;
        if (stack is null || stack.Count == 0) return;
        if (response.Usage is { } usage)
        {
            foreach (var acc in stack) acc.Add(usage);
        }
        if (!string.IsNullOrEmpty(response.ModelId))
        {
            foreach (var acc in stack) acc.ModelId = response.ModelId;
        }
    }

    private static void Capture(ChatResponseUpdate update)
    {
        var stack = Current.Value;
        if (stack is null || stack.Count == 0) return;

        foreach (var content in update.Contents)
        {
            if (content is UsageContent usage)
            {
                foreach (var acc in stack) acc.Add(usage.Details);
            }
        }
        if (!string.IsNullOrEmpty(update.ModelId))
        {
            foreach (var acc in stack) acc.ModelId = update.ModelId;
        }
    }

    private sealed class Releaser(ImmutableList<TokenUsageAccumulator>? previous) : IDisposable
    {
        public void Dispose() => Current.Value = previous;
    }
}

/// <summary>
/// Builder extension that wires <see cref="TokenUsageCapturingChatClient"/> into a
/// <see cref="ChatClientBuilder"/> pipeline. Call inside the same fluent chain as
/// <c>UseOpenTelemetry(...)</c> so the OTel span captures the inner LLM call and the
/// accumulator captures the usage emitted on the response.
/// </summary>
public static class TokenUsageCapturingChatClientBuilderExtensions
{
    public static ChatClientBuilder UseTokenUsageCapture(this ChatClientBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        return builder.Use(inner => new TokenUsageCapturingChatClient(inner));
    }
}
