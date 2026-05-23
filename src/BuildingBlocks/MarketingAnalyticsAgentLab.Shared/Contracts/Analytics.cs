namespace MarketingAnalyticsAgentLab.Shared.Contracts;

public sealed record DailyMetricPoint(DateOnly Date, double Value);

public sealed record EmailDeliveryReport(
    DateOnly From,
    DateOnly To,
    long TotalSent,
    long Delivered,
    long Bounced,
    double DeliveryRate,
    IReadOnlyList<DailyMetricPoint> DailyDelivered);

public sealed record OpenRateReport(
    DateOnly From,
    DateOnly To,
    double OverallOpenRate,
    IReadOnlyList<DailyMetricPoint> DailyOpenRate);

public sealed record ClickThroughReport(
    DateOnly From,
    DateOnly To,
    double OverallClickThroughRate,
    IReadOnlyList<DailyMetricPoint> DailyClickThroughRate);

public sealed record CampaignSummaryReport(
    Guid CampaignId,
    string CampaignName,
    long Sent,
    long Delivered,
    long Opened,
    long Clicked,
    long Unsubscribed,
    double OpenRate,
    double ClickThroughRate,
    double UnsubscribeRate);
