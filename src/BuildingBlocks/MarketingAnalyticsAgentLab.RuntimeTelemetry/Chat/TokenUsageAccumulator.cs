using Microsoft.Extensions.AI;

namespace MarketingAnalyticsAgentLab.RuntimeTelemetry.Chat;

/// <summary>
/// Per-execution accumulator for token usage observed across every <c>IChatClient</c> call
/// made inside one agent run. An agent may invoke the LLM multiple times in a single run
/// (initial completion, then again after each tool result), so totals are summed across
/// those turns rather than overwritten on the last response.
///
/// Not thread-safe. One accumulator is created per agent run and owned by the request
/// thread; <see cref="TokenUsageCapturingChatClient"/> reads it via <c>AsyncLocal</c> and
/// adds usage as each response arrives.
/// </summary>
public sealed class TokenUsageAccumulator
{
    /// <summary>Model id reported by the chat client. Last non-empty value wins so a
    /// late-binding deployment override is reflected accurately.</summary>
    public string ModelId { get; set; } = string.Empty;

    public int InputTokens { get; private set; }
    public int OutputTokens { get; private set; }
    public int TotalTokens => InputTokens + OutputTokens;

    public void Add(UsageDetails usage)
    {
        if (usage.InputTokenCount  is long i) InputTokens  += (int)i;
        if (usage.OutputTokenCount is long o) OutputTokens += (int)o;
    }

    public void Add(int inputTokens, int outputTokens)
    {
        InputTokens  += inputTokens;
        OutputTokens += outputTokens;
    }
}
