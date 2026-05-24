namespace MarketingAnalyticsAgentLab.RuntimeTelemetry.Pricing;

/// <summary>
/// Computes estimated USD for one execution given the model id and token counts.
///
/// Pricing is a moving target (vendor pricing pages change without warning, regional
/// surcharges apply, batch APIs cost less). The Gateway calls this once per execution
/// and persists the result so historical rows survive a pricing update.
/// </summary>
public interface ITokenPricing
{
    /// <summary>Returns USD cost for the given model + token counts. Unknown models cost 0
    /// so a new deployment doesn't crash the persistence path.</summary>
    decimal EstimateUsd(string modelId, int inputTokens, int outputTokens);
}

/// <summary>
/// Pricing entry stored per model. USD per 1k tokens, kept in two buckets so input and
/// output can be priced separately (output is typically more expensive).
/// </summary>
public sealed record TokenPriceEntry(string ModelId, decimal InputPricePer1K, decimal OutputPricePer1K);
