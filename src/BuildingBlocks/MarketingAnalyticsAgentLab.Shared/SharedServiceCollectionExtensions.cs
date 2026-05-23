using MarketingAnalyticsAgentLab.Shared.Abstractions;
using Microsoft.Extensions.DependencyInjection;

namespace MarketingAnalyticsAgentLab.Shared;

public static class SharedServiceCollectionExtensions
{
    /// <summary>
    /// Registers the cross-cutting abstractions (tenant context, API catalog seam) used by
    /// every service in the platform. Concrete agent / MCP / plugin / assistant registries
    /// are added by the individual hosts since they hold runtime state.
    /// </summary>
    public static IServiceCollection AddPlatformAbstractions(this IServiceCollection services)
    {
        services.AddSingleton<ITenantContext, DefaultTenantContext>();
        services.AddSingleton<IApiCatalog, InMemoryApiCatalog>();
        return services;
    }
}

internal sealed class InMemoryApiCatalog : IApiCatalog
{
    private readonly List<ApiEndpointDescriptor> _descriptors = new();
    private readonly Lock _lock = new();

    public IReadOnlyList<ApiEndpointDescriptor> List()
    {
        lock (_lock)
        {
            return _descriptors.ToArray();
        }
    }

    public void Register(ApiEndpointDescriptor descriptor)
    {
        lock (_lock)
        {
            _descriptors.RemoveAll(d => string.Equals(d.ServiceName, descriptor.ServiceName, StringComparison.OrdinalIgnoreCase));
            _descriptors.Add(descriptor);
        }
    }
}
