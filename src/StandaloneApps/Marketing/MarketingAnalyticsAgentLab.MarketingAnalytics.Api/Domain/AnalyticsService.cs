using MarketingAnalyticsAgentLab.Shared.Contracts;

namespace MarketingAnalyticsAgentLab.MarketingAnalytics.Api.Domain;

/// <summary>
/// Deterministic-ish mock analytics service. Generates daily metric series for the requested
/// window using a stable seed so that repeated queries from the agent produce coherent
/// numbers across calls within the same run.
/// </summary>
internal sealed class AnalyticsService
{
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    public EmailDeliveryReport GetDeliveryReport(int days)
    {
        var window = Window(days);
        var daily = GenerateSeries(window, seed: 42, min: 8_500, max: 14_500);
        var totalDelivered = (long)daily.Sum(p => p.Value);
        var totalSent = (long)(totalDelivered * 1.07);
        var bounced = totalSent - totalDelivered;
        return new EmailDeliveryReport(
            From: window.From,
            To: window.To,
            TotalSent: totalSent,
            Delivered: totalDelivered,
            Bounced: bounced,
            DeliveryRate: Math.Round((double)totalDelivered / totalSent, 4),
            DailyDelivered: daily);
    }

    public OpenRateReport GetOpenRateReport(int days)
    {
        var window = Window(days);
        var daily = GenerateSeries(window, seed: 7, min: 0.18, max: 0.41);
        return new OpenRateReport(
            From: window.From,
            To: window.To,
            OverallOpenRate: Math.Round(daily.Average(p => p.Value), 4),
            DailyOpenRate: daily);
    }

    public ClickThroughReport GetClickThroughReport(int days)
    {
        var window = Window(days);
        var daily = GenerateSeries(window, seed: 13, min: 0.025, max: 0.068);
        return new ClickThroughReport(
            From: window.From,
            To: window.To,
            OverallClickThroughRate: Math.Round(daily.Average(p => p.Value), 4),
            DailyClickThroughRate: daily);
    }

    public CampaignSummaryReport GetCampaignSummary(Guid campaignId, string campaignName)
    {
        var rng = new Random(campaignId.GetHashCode());
        var sent = rng.Next(2_000, 24_000);
        var deliveryRate = 0.96 + rng.NextDouble() * 0.03;
        var openRate = 0.18 + rng.NextDouble() * 0.22;
        var ctr = 0.025 + rng.NextDouble() * 0.04;
        var unsubRate = 0.001 + rng.NextDouble() * 0.005;

        var delivered = (long)(sent * deliveryRate);
        var opened = (long)(delivered * openRate);
        var clicked = (long)(opened * ctr / Math.Max(openRate, 0.001));
        var unsubscribed = (long)(delivered * unsubRate);

        return new CampaignSummaryReport(
            CampaignId: campaignId,
            CampaignName: campaignName,
            Sent: sent,
            Delivered: delivered,
            Opened: opened,
            Clicked: clicked,
            Unsubscribed: unsubscribed,
            OpenRate: Math.Round(openRate, 4),
            ClickThroughRate: Math.Round(ctr, 4),
            UnsubscribeRate: Math.Round(unsubRate, 4));
    }

    private static (DateOnly From, DateOnly To) Window(int days)
    {
        days = Math.Clamp(days, 1, 180);
        return (Today.AddDays(-days + 1), Today);
    }

    private static List<DailyMetricPoint> GenerateSeries((DateOnly From, DateOnly To) window, int seed, double min, double max)
    {
        var rng = new Random(seed);
        var points = new List<DailyMetricPoint>();
        for (var d = window.From; d <= window.To; d = d.AddDays(1))
        {
            var value = min + rng.NextDouble() * (max - min);
            // light weekend dip for realism
            if (d.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
            {
                value *= 0.78;
            }
            points.Add(new DailyMetricPoint(d, Math.Round(value, 4)));
        }
        return points;
    }
}
