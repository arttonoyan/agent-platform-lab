namespace MarketingAnalyticsAgentLab.Shared.Abstractions;

/// <summary>
/// Resolves the current tenant identifier for a request. A static "default" implementation
/// ships in this POC; future work can plug in a JWT-claim, header, or subdomain-driven
/// resolver without touching call sites that already depend on this abstraction.
/// </summary>
public interface ITenantContext
{
    string TenantId { get; }
}

internal sealed class DefaultTenantContext : ITenantContext
{
    public string TenantId => "default";
}
