using System.Collections.Concurrent;
using MarketingAnalyticsAgentLab.Shared.Contracts;

namespace MarketingAnalyticsAgentLab.CampaignManagement.Api.Domain;

/// <summary>
/// In-memory mock repository pre-seeded with realistic ServiceTitan-style HVAC / plumbing /
/// electrical marketing campaigns. Thread-safe so that concurrent agent calls don't trample
/// each other while exploring the API.
/// </summary>
internal sealed class CampaignRepository
{
    private readonly ConcurrentDictionary<Guid, Campaign> _campaigns = new();

    public CampaignRepository()
    {
        Seed();
    }

    public IReadOnlyList<Campaign> List(CampaignStatus? status)
        => _campaigns.Values
            .Where(c => status is null || c.Status == status)
            .OrderByDescending(c => c.CreatedAt)
            .ToArray();

    public Campaign? Find(Guid id) => _campaigns.TryGetValue(id, out var c) ? c : null;

    public Campaign Create(CreateCampaignRequest request)
    {
        var campaign = new Campaign
        {
            Name = request.Name,
            Subject = request.Subject,
            Channel = request.Channel,
            Status = request.ScheduledAt is null ? CampaignStatus.Draft : CampaignStatus.Scheduled,
            SegmentName = request.SegmentName,
            AudienceSize = Random.Shared.Next(500, 18_000),
            ScheduledAt = request.ScheduledAt,
        };
        _campaigns[campaign.Id] = campaign;
        return campaign;
    }

    public bool TrySend(Guid id, bool dryRun, out Campaign? campaign)
    {
        campaign = Find(id);
        if (campaign is null)
        {
            return false;
        }
        if (!dryRun)
        {
            campaign.Status = CampaignStatus.Sent;
            campaign.SentAt = DateTimeOffset.UtcNow;
        }
        return true;
    }

    private void Seed()
    {
        var now = DateTimeOffset.UtcNow;
        var seeds = new (string Name, string Subject, CampaignChannel Channel, CampaignStatus Status, string Segment, int Days)[]
        {
            ("Spring HVAC Tune-Up 2026",         "Beat the spring rush - schedule your tune-up today", CampaignChannel.Email, CampaignStatus.Sent,      "HVAC Maintenance Plan Members",   42),
            ("Summer AC Promo - $79 Inspection", "Stay cool this summer with our $79 AC inspection",    CampaignChannel.Email, CampaignStatus.Sent,      "Repeat HVAC Customers",            28),
            ("Plumbing Membership Renewal",      "Your TotalCare membership is about to expire",        CampaignChannel.Email, CampaignStatus.Sending,   "Expiring TotalCare Members",       2),
            ("Electrical Safety Awareness",      "Free safety inspection for new homeowners",           CampaignChannel.Email, CampaignStatus.Scheduled, "New Homeowners",                   -3),
            ("Generator Backup Special",         "Power outages? Whole-home generators - 0% APR",       CampaignChannel.Email, CampaignStatus.Draft,     "Premium Electrical Leads",         -7),
            ("Winter Furnace Tune-Up",           "Winter is coming - protect your furnace",             CampaignChannel.Email, CampaignStatus.Sent,      "HVAC Maintenance Plan Members",   80),
            ("Tankless Water Heater Upgrade",    "Upgrade to a tankless water heater - $500 off",       CampaignChannel.Email, CampaignStatus.Sent,      "Plumbing Repeat Customers",        60),
            ("Drain Cleaning Special",           "$99 drain cleaning - this weekend only",              CampaignChannel.Sms,   CampaignStatus.Sent,      "Plumbing Active Service Area",     10),
            ("Smart Thermostat Promotion",       "Save 23% on energy bills with a smart thermostat",    CampaignChannel.Email, CampaignStatus.Sent,      "HVAC Customers, Tech-Savvy",       18),
            ("Holiday Lighting Install",         "Stress-free holiday lighting installation",           CampaignChannel.Email, CampaignStatus.Draft,     "Premium Residential",              -14),
        };
        foreach (var s in seeds)
        {
            var sentAt = s.Status == CampaignStatus.Sent ? now.AddDays(-s.Days) : (DateTimeOffset?)null;
            var scheduled = s.Status == CampaignStatus.Scheduled ? now.AddDays(-s.Days) : sentAt;
            var c = new Campaign
            {
                Name = s.Name,
                Subject = s.Subject,
                Channel = s.Channel,
                Status = s.Status,
                SegmentName = s.Segment,
                AudienceSize = Random.Shared.Next(800, 22_000),
                ScheduledAt = scheduled,
                SentAt = sentAt,
            };
            _campaigns[c.Id] = c;
        }
    }
}
