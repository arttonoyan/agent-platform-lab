using System.Runtime.CompilerServices;
using Microsoft.Extensions.AI;

namespace MarketingAnalyticsAgentLab.RuntimeTelemetry.Chat;

/// <summary>
/// <see cref="DelegatingChatClient"/> that captures token usage from every chat completion
/// flowing through it and folds it into the ambient <see cref="TokenUsageAccumulator"/>.
/// The accumulator is published via an <c>AsyncLocal</c> so the entire agent run (across
/// multiple LLM turns + tool calls) accumulates into one record without callers having to
/// thread a context object through.
///
/// Pattern follows Microsoft.Extensions.AI's middleware guidance: wrap the inner
/// <c>IChatClient</c> in a builder pipeline, observe every response, and pass the data
/// through unchanged.
/// </summary>
public sealed class TokenUsageCapturingChatClient(IChatClient inner) : DelegatingChatClient(inner)
{
    private static readonly AsyncLocal<TokenUsageAccumulator?> Current = new();

    /// <summary>
    /// Publishes the accumulator on the current async flow. Dispose to clear it.
    /// Calls made inside this scope (including nested LLM turns from agent tool loops)
    /// observe their token usage being added to the accumulator.
    /// </summary>
    public static IDisposable Capture(TokenUsageAccumulator accumulator)
    {
        ArgumentNullException.ThrowIfNull(accumulator);
        Current.Value = accumulator;
        return new Releaser();
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
        if (Current.Value is not { } acc) return;
        if (response.Usage is { } usage)
        {
            acc.Add(usage);
        }
        if (!string.IsNullOrEmpty(response.ModelId))
        {
            acc.ModelId = response.ModelId;
        }
    }

    private static void Capture(ChatResponseUpdate update)
    {
        if (Current.Value is not { } acc) return;

        foreach (var content in update.Contents)
        {
            if (content is UsageContent usage)
            {
                acc.Add(usage.Details);
            }
        }
        if (!string.IsNullOrEmpty(update.ModelId))
        {
            acc.ModelId = update.ModelId;
        }
    }

    private sealed class Releaser : IDisposable
    {
        public void Dispose() => Current.Value = null;
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
