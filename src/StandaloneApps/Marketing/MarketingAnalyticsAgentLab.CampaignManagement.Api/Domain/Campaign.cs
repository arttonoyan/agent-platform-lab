using MarketingAnalyticsAgentLab.Shared.Contracts;

namespace MarketingAnalyticsAgentLab.CampaignManagement.Api.Domain;

internal sealed class Campaign
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string Subject { get; set; }
    public CampaignChannel Channel { get; set; }
    public CampaignStatus Status { get; set; }
    public required string SegmentName { get; set; }
    public int AudienceSize { get; set; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ScheduledAt { get; set; }
    public DateTimeOffset? SentAt { get; set; }

    public CampaignDto ToDto() => new(
        Id, Name, Subject, Channel, Status, SegmentName, AudienceSize,
        CreatedAt, ScheduledAt, SentAt);
}
