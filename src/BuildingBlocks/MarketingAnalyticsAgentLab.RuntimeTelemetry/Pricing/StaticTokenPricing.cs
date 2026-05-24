namespace MarketingAnalyticsAgentLab.RuntimeTelemetry.Pricing;

/// <summary>
/// In-memory pricing table. Values are USD per 1k tokens and roughly match Azure OpenAI
/// list prices for the deployments this lab uses. Keep this table in one place and
/// out of the dashboard so a price refresh is a one-line code change.
///
/// For real billing reconciliation, replace this with a config-driven implementation
/// that reads from a price-list source (Cosmos DB / Azure Cost Management / vendor API).
/// </summary>
public sealed class StaticTokenPricing : ITokenPricing
{
    /// <summary>Pricing entries indexed by lowercased model id and by lowercased model id
    /// without the trailing suffix (so <c>gpt-4o-mini-2024-07-18</c> still matches
    /// <c>gpt-4o-mini</c>).</summary>
    private readonly Dictionary<string, TokenPriceEntry> _byExactId;
    private readonly TokenPriceEntry[] _byPrefix;

    public StaticTokenPricing(IEnumerable<TokenPriceEntry>? entries = null)
    {
        var resolved = (entries ?? DefaultEntries).ToArray();
        _byExactId = resolved.ToDictionary(e => e.ModelId.ToLowerInvariant(), e => e);
        _byPrefix = resolved;
    }

    public decimal EstimateUsd(string modelId, int inputTokens, int outputTokens)
    {
        if (string.IsNullOrWhiteSpace(modelId) || (inputTokens <= 0 && outputTokens <= 0))
        {
            return 0m;
        }

        var entry = Resolve(modelId);
        if (entry is null) return 0m;

        var input  = entry.InputPricePer1K  * inputTokens  / 1000m;
        var output = entry.OutputPricePer1K * outputTokens / 1000m;
        return decimal.Round(input + output, 6, MidpointRounding.AwayFromZero);
    }

    private TokenPriceEntry? Resolve(string modelId)
    {
        var lower = modelId.ToLowerInvariant();
        if (_byExactId.TryGetValue(lower, out var exact)) return exact;

        // Fall back to longest-prefix match so date-suffixed deployments still price correctly.
        TokenPriceEntry? best = null;
        var bestLen = 0;
        foreach (var entry in _byPrefix)
        {
            var key = entry.ModelId.ToLowerInvariant();
            if (lower.StartsWith(key, StringComparison.Ordinal) && key.Length > bestLen)
            {
                best = entry;
                bestLen = key.Length;
            }
        }
        return best;
    }

    /// <summary>
    /// Default table. Values current as of 2026-05 from the Azure OpenAI pricing page;
    /// edit and rebuild to refresh. Unknown models intentionally cost 0 (see
    /// <see cref="EstimateUsd"/>) so a brand-new deployment never breaks ingestion.
    /// </summary>
    public static readonly IReadOnlyList<TokenPriceEntry> DefaultEntries = new TokenPriceEntry[]
    {
        new("gpt-4o",          InputPricePer1K: 0.005m,  OutputPricePer1K: 0.015m),
        new("gpt-4o-mini",     InputPricePer1K: 0.00015m, OutputPricePer1K: 0.0006m),
        new("gpt-4.1",         InputPricePer1K: 0.002m,  OutputPricePer1K: 0.008m),
        new("gpt-4.1-mini",    InputPricePer1K: 0.0004m, OutputPricePer1K: 0.0016m),
        new("gpt-4-turbo",     InputPricePer1K: 0.01m,   OutputPricePer1K: 0.03m),
        new("gpt-3.5-turbo",   InputPricePer1K: 0.0005m, OutputPricePer1K: 0.0015m),
        new("o1",              InputPricePer1K: 0.015m,  OutputPricePer1K: 0.06m),
        new("o1-mini",         InputPricePer1K: 0.003m,  OutputPricePer1K: 0.012m),
        new("o3-mini",         InputPricePer1K: 0.0011m, OutputPricePer1K: 0.0044m),
    };
}
