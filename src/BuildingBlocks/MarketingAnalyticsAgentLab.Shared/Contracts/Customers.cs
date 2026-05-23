namespace MarketingAnalyticsAgentLab.Shared.Contracts;

public enum LifecycleStage
{
    Prospect = 0,
    Lead = 1,
    Customer = 2,
    Repeat = 3,
    Churned = 4,
}

public sealed record CustomerDto(
    Guid Id,
    string FullName,
    string Email,
    string? PhoneNumber,
    string City,
    string State,
    LifecycleStage LifecycleStage,
    decimal LifetimeValue,
    DateTimeOffset CreatedAt,
    IReadOnlyList<string> Tags);

public sealed record CustomerSegmentDto(
    Guid Id,
    string Name,
    string Description,
    int CustomerCount,
    IReadOnlyList<string> CriteriaSummary);
