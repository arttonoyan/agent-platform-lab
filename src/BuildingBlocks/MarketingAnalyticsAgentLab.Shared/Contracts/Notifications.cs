namespace MarketingAnalyticsAgentLab.Shared.Contracts;

public enum NotificationStatus
{
    Queued = 0,
    Sending = 1,
    Delivered = 2,
    Failed = 3,
}

public sealed record SendEmailRequest(
    string ToEmail,
    string Subject,
    string HtmlBody,
    Guid? CampaignId = null);

public sealed record SendSmsRequest(
    string ToPhoneNumber,
    string Message,
    Guid? CampaignId = null);

public sealed record NotificationDto(
    Guid Id,
    string Channel,
    string Recipient,
    NotificationStatus Status,
    DateTimeOffset QueuedAt,
    DateTimeOffset? DeliveredAt,
    Guid? CampaignId);
