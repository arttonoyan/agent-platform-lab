using MarketingAnalyticsAgentLab.RuntimeTelemetry.Pricing;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace MarketingAnalyticsAgentLab.RuntimeTelemetry;

public static class RuntimeTelemetryServiceCollectionExtensions
{
    /// <summary>
    /// Registers the runtime telemetry pipeline on top of an EF Core <see cref="DbContext"/>
    /// that the caller has already wired (typically via Aspire's
    /// <c>AddNpgsqlDbContext&lt;RuntimeTelemetryDbContext&gt;</c>). This keeps the building
    /// block agnostic of how the connection is opened — the Gateway uses Aspire's full
    /// integration (health checks + OTel + retries), but a unit test can register a Sqlite
    /// or in-memory provider for the same <c>DbContext</c> and call this method unchanged.
    /// </summary>
    public static IServiceCollection AddRuntimeTelemetry(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.AddSingleton<ITokenPricing>(new StaticTokenPricing());
        services.AddSingleton<IExecutionEventStore, EfExecutionEventStore>();

        return services;
    }

    /// <summary>
    /// Ensures the telemetry schema exists. Call once at startup. Uses
    /// <c>EnsureCreatedAsync</c> (no migrations history) which is appropriate for a POC
    /// running against a fresh Aspire-managed container; swap for <c>MigrateAsync</c>
    /// once migrations are introduced.
    /// </summary>
    public static async Task<WebApplication> EnsureRuntimeTelemetrySchemaAsync(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        // Aspire spins up the Postgres container while the gateway is starting; the
        // standard Aspire retry policy on the connection handles the brief gap, but a
        // short outer retry around EnsureCreated lets us survive a cold-start race
        // without crashing the host.
        var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("RuntimeTelemetry");

        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<RuntimeTelemetryDbContext>();

        const int MaxAttempts = 10;
        var delay = TimeSpan.FromSeconds(1);
        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            try
            {
                await db.Database.EnsureCreatedAsync().ConfigureAwait(false);
                logger.LogInformation("Runtime telemetry schema ensured after {Attempts} attempt(s).", attempt);
                return app;
            }
            catch (Exception ex) when (attempt < MaxAttempts)
            {
                logger.LogWarning(ex,
                    "Runtime telemetry schema not ready (attempt {Attempt}/{MaxAttempts}); retrying in {DelayMs}ms.",
                    attempt, MaxAttempts, (int)delay.TotalMilliseconds);
                await Task.Delay(delay).ConfigureAwait(false);
                delay = TimeSpan.FromMilliseconds(Math.Min(delay.TotalMilliseconds * 1.5, 10_000));
            }
        }

        return app;
    }
}
