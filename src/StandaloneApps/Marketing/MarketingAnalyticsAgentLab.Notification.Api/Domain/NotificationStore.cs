using System.Collections.Concurrent;
using MarketingAnalyticsAgentLab.Shared.Contracts;

namespace MarketingAnalyticsAgentLab.Notification.Api.Domain;

/// <summary>
/// In-memory notification store. Production wiring would replace this with the real
/// transactional email + SMS gateways (SendGrid, Twilio, etc.) gated behind feature flags.
/// </summary>
internal sealed class NotificationStore
{
    private readonly ConcurrentDictionary<Guid, NotificationDto> _notifications = new();

    public NotificationDto Enqueue(string channel, string recipient, Guid? campaignId)
    {
        var id = Guid.NewGuid();
        var queuedAt = DateTimeOffset.UtcNow;
        // Simulate near-instant transition Queued -> Delivered. Real systems would do this
        // asynchronously, but for the POC we want the agent's tool call to return a stable
        // final state without races.
        var notification = new NotificationDto(
            Id: id,
            Channel: channel,
            Recipient: recipient,
            Status: NotificationStatus.Delivered,
            QueuedAt: queuedAt,
            DeliveredAt: queuedAt.AddMilliseconds(120),
            CampaignId: campaignId);
        _notifications[id] = notification;
        return notification;
    }

    public NotificationDto? Find(Guid id) => _notifications.TryGetValue(id, out var n) ? n : null;
}
