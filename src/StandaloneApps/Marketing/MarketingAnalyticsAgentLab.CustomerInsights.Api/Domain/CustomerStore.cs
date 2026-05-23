using MarketingAnalyticsAgentLab.Shared.Contracts;

namespace MarketingAnalyticsAgentLab.CustomerInsights.Api.Domain;

/// <summary>
/// Deterministic seeded customer + segment data. Generates a stable list of 250 ServiceTitan-
/// style residential customers and a curated set of marketing segments.
/// </summary>
internal sealed class CustomerStore
{
    private readonly List<CustomerDto> _customers;
    private readonly List<CustomerSegmentDto> _segments;
    private readonly Dictionary<Guid, List<Guid>> _segmentToCustomers;

    public CustomerStore()
    {
        _customers = SeedCustomers();
        _segments = SeedSegments();
        _segmentToCustomers = AssignCustomersToSegments(_customers, _segments);
    }

    public IReadOnlyList<CustomerDto> ListCustomers(LifecycleStage? stage, int take)
        => _customers
            .Where(c => stage is null || c.LifecycleStage == stage)
            .Take(Math.Clamp(take, 1, 250))
            .ToArray();

    public CustomerDto? FindCustomer(Guid id) => _customers.FirstOrDefault(c => c.Id == id);

    public IReadOnlyList<CustomerSegmentDto> ListSegments() => _segments;

    public IReadOnlyList<CustomerDto> ListCustomersInSegment(Guid segmentId, int take)
    {
        if (!_segmentToCustomers.TryGetValue(segmentId, out var ids))
        {
            return Array.Empty<CustomerDto>();
        }
        var max = Math.Clamp(take, 1, 100);
        return ids
            .Take(max)
            .Select(id => _customers.First(c => c.Id == id))
            .ToArray();
    }

    private static List<CustomerDto> SeedCustomers()
    {
        var rng = new Random(2026);
        var firstNames = new[] { "Alex", "Jordan", "Taylor", "Casey", "Morgan", "Sam", "Riley", "Drew", "Avery", "Quinn", "Cameron", "Reese", "Hayden", "Skyler", "Parker", "Rowan", "Emerson" };
        var lastNames = new[] { "Anderson", "Brown", "Carter", "Davis", "Evans", "Foster", "Garcia", "Hill", "Iverson", "Jenkins", "Kim", "Lopez", "Martinez", "Nguyen", "Olsen", "Patel", "Quintero", "Robinson", "Stewart", "Thompson" };
        var cities = new[] { ("Austin", "TX"), ("Denver", "CO"), ("Phoenix", "AZ"), ("Portland", "OR"), ("Atlanta", "GA"), ("Nashville", "TN"), ("Tampa", "FL"), ("Sacramento", "CA"), ("Raleigh", "NC"), ("Columbus", "OH") };
        var tagPool = new[] { "HVAC", "Plumbing", "Electrical", "MaintenancePlan", "HighValue", "Repeat", "PriceSensitive", "Loyal", "Risk:Churn", "Premium", "SmartHome" };
        var now = DateTimeOffset.UtcNow;
        var list = new List<CustomerDto>(250);
        for (var i = 0; i < 250; i++)
        {
            var first = firstNames[rng.Next(firstNames.Length)];
            var last = lastNames[rng.Next(lastNames.Length)];
            var city = cities[rng.Next(cities.Length)];
            var stage = (LifecycleStage)rng.Next(0, 5);
            var tags = Enumerable.Range(0, rng.Next(1, 4))
                .Select(_ => tagPool[rng.Next(tagPool.Length)])
                .Distinct()
                .ToArray();
            list.Add(new CustomerDto(
                Id: Guid.NewGuid(),
                FullName: $"{first} {last}",
                Email: $"{first.ToLowerInvariant()}.{last.ToLowerInvariant()}{i}@example.com",
                PhoneNumber: $"+1-{rng.Next(200, 999)}-{rng.Next(100, 999):000}-{rng.Next(0, 9999):0000}",
                City: city.Item1,
                State: city.Item2,
                LifecycleStage: stage,
                LifetimeValue: Math.Round((decimal)(rng.NextDouble() * 12_000 + 250), 2),
                CreatedAt: now.AddDays(-rng.Next(0, 1200)),
                Tags: tags));
        }
        return list;
    }

    private static List<CustomerSegmentDto> SeedSegments() => new()
    {
        new(Guid.NewGuid(), "HVAC Maintenance Plan Members",   "Customers with an active HVAC maintenance plan.",                15_240, new[] { "tag=HVAC", "tag=MaintenancePlan", "lifecycle in (Customer, Repeat)" }),
        new(Guid.NewGuid(), "Repeat HVAC Customers",            "Customers who booked >=2 HVAC service visits.",                  8_910,  new[] { "tag=HVAC", "lifecycle=Repeat" }),
        new(Guid.NewGuid(), "Expiring TotalCare Members",       "TotalCare memberships expiring in the next 30 days.",            1_245,  new[] { "tag=MaintenancePlan", "membershipExpiresAt <= now + 30d" }),
        new(Guid.NewGuid(), "New Homeowners",                   "Customers acquired in the last 90 days.",                        3_580,  new[] { "createdAt > now - 90d", "lifecycle in (Prospect, Lead, Customer)" }),
        new(Guid.NewGuid(), "Premium Electrical Leads",         "High-LTV prospects in the electrical service area.",             2_140,  new[] { "tag=Electrical", "lifetimeValue >= 4000" }),
        new(Guid.NewGuid(), "Plumbing Repeat Customers",        "Customers with >=2 plumbing tickets in the last year.",          6_780,  new[] { "tag=Plumbing", "lifecycle=Repeat" }),
        new(Guid.NewGuid(), "HVAC Customers, Tech-Savvy",       "HVAC customers tagged with SmartHome interest.",                 4_320,  new[] { "tag=HVAC", "tag=SmartHome" }),
        new(Guid.NewGuid(), "Premium Residential",              "High-LTV residential customers across all trades.",              9_120,  new[] { "lifetimeValue >= 6000", "lifecycle in (Repeat, Customer)" }),
    };

    private static Dictionary<Guid, List<Guid>> AssignCustomersToSegments(List<CustomerDto> customers, List<CustomerSegmentDto> segments)
    {
        var rng = new Random(99);
        var dict = new Dictionary<Guid, List<Guid>>();
        foreach (var seg in segments)
        {
            // Pick a handful of customers per segment for the API to return as samples.
            dict[seg.Id] = customers
                .OrderBy(_ => rng.Next())
                .Take(rng.Next(20, 80))
                .Select(c => c.Id)
                .ToList();
        }
        return dict;
    }
}
