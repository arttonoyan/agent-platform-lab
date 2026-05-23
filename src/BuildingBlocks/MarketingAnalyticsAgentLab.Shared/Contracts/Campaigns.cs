namespace MarketingAnalyticsAgentLab.Shared.Contracts;

/// <summary>
/// Lifecycle of a marketing campaign. Mirrored across the campaigns API, plugins, and agents
/// so that prompts and tool descriptions can refer to a single vocabulary.
/// </summary>
public enum CampaignStatus
{
    Draft = 0,
    Scheduled = 1,
    Sending = 2,
    Sent = 3,
    Cancelled = 4,
}

public enum CampaignChannel
{
    Email = 0,
    Sms = 1,
    Push = 2,
}

public sealed record CampaignDto(
    Guid Id,
    string Name,
    string Subject,
    CampaignChannel Channel,
    CampaignStatus Status,
    string SegmentName,
    int AudienceSize,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ScheduledAt,
    DateTimeOffset? SentAt);

public sealed record CreateCampaignRequest(
    string Name,
    string Subject,
    CampaignChannel Channel,
    string SegmentName,
    DateTimeOffset? ScheduledAt);

public sealed record SendCampaignRequest(bool DryRun = false);

public sealed record SendCampaignResponse(
    Guid CampaignId,
    CampaignStatus Status,
    int RecipientCount,
    DateTimeOffset DispatchedAt);
