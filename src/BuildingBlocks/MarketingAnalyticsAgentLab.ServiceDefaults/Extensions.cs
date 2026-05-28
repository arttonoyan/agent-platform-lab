using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace MarketingAnalyticsAgentLab.ServiceDefaults;

/// <summary>
/// Aspire-style "service defaults" shared by every web/api service in the platform.
/// Provides OpenTelemetry (traces + metrics + logs), service discovery, resilient HttpClients,
/// health checks, and the agent-framework observability sources used by the AgentRuntime
/// and McpServer.
/// </summary>
public static class Extensions
{
    private const string HealthEndpointPath = "/health";
    private const string AlivenessEndpointPath = "/alive";

    /// <summary>
    /// Single platform-wide OpenTelemetry <see cref="System.Diagnostics.ActivitySource"/> name.
    /// Every platform component creates its own spans under this source so traces flow into
    /// both the Aspire dashboard and the Agent Framework DevUI viewer with consistent attribution.
    /// </summary>
    public const string PlatformActivitySource = "MarketingAnalyticsAgentLab";

    /// <summary>
    /// Wires the standard cross-cutting concerns: OpenTelemetry, service discovery,
    /// resilient HTTP, and health checks. Call this from every service's <c>Program.cs</c>.
    /// </summary>
    /// <summary>
    /// CORS policy name used by the platform's development front-ends (AdminPortal,
    /// FakeAtlasApp) to call platform services from the browser.
    /// </summary>
    public const string PlatformCorsPolicy = "PlatformDevCors";

    /// <summary>
    /// Shared <see cref="JsonSerializerOptions"/> instance for every internal HttpClient
    /// that deserializes JSON returned by another platform service. Mirrors the
    /// server-side configuration in <see cref="AddServiceDefaults{TBuilder}"/> — most
    /// importantly, includes <see cref="JsonStringEnumConverter"/> so consumers can read
    /// enums serialized as either their string name (the platform default) or their
    /// numeric value (back-compat for any client that hasn't been updated). Without this,
    /// a service returning <c>"In": "Query"</c> blows up the consumer's deserializer with
    /// "The JSON value could not be converted to ... PluginParameter".
    /// </summary>
    public static readonly JsonSerializerOptions PlatformHttpClientJson = CreatePlatformJsonOptions();

    private static JsonSerializerOptions CreatePlatformJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }

    public static TBuilder AddServiceDefaults<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        builder.ConfigureOpenTelemetry();

        builder.AddDefaultHealthChecks();

        builder.Services.AddServiceDiscovery();

        builder.Services.ConfigureHttpClientDefaults(http =>
        {
            // Standard retry/timeout/circuit-breaker policies provided by Microsoft.Extensions.Http.Resilience
            http.AddStandardResilienceHandler();

            // Resolves "https+http://<service-name>" URLs through Aspire service discovery
            http.AddServiceDiscovery();
        });

        // Permissive CORS for local development so the AdminPortal (npm app on its own port)
        // and FakeAtlasApp can POST JSON to platform services without preflight rejections.
        // The policy is applied per service only when MapPlatformCors() is called from
        // its Program.cs.
        builder.Services.AddCors(options =>
        {
            options.AddPolicy(PlatformCorsPolicy, policy => policy
                .SetIsOriginAllowed(_ => true)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials());
        });

        // Serialize C# enums as their string names rather than the default numeric value.
        // The platform's contract types (AgentKind, PluginStatus, AssistantToolCallStatus,
        // etc.) flow through JSON to React clients that switch on string literals — without
        // this every enum-typed field comes across as 0/1/2 and the clients silently fail
        // to match. ConfigureHttpJsonOptions is the global hook for ASP.NET Core minimal
        // APIs; controllers pick this up automatically too in net8+.
        builder.Services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
        });

        return builder;
    }

    /// <summary>
    /// Applies the platform's permissive development CORS policy. Call from each platform
    /// service's <c>Program.cs</c> AFTER <c>UseRouting</c> but BEFORE the endpoint mappings.
    /// </summary>
    public static WebApplication UsePlatformCors(this WebApplication app)
    {
        app.UseCors(PlatformCorsPolicy);
        return app;
    }

    /// <summary>
    /// Adds OpenTelemetry sources specific to AI agents and tool execution so that
    /// agent runs, MCP tool calls, and chat completions show up in the Aspire dashboard.
    /// Idempotent: call this from the Agent Host and the MCP Server, but it is a no-op
    /// on services that don't host agents.
    /// </summary>
    public static TBuilder AddAgentObservability<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        builder.Services.AddOpenTelemetry()
            .WithTracing(tracing =>
            {
                tracing.AddSource(
                    "Microsoft.Agents.AI",
                    "Microsoft.Agents.AI.Workflows",
                    "Microsoft.Extensions.AI",
                    "Experimental.Microsoft.Extensions.AI",
                    "ModelContextProtocol");
            })
            .WithMetrics(metrics =>
            {
                metrics.AddMeter(
                    "Microsoft.Agents.AI",
                    "Microsoft.Extensions.AI",
                    "ModelContextProtocol");
            });

        return builder;
    }

    private static TBuilder ConfigureOpenTelemetry<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        builder.Services.AddOpenTelemetry()
            .WithMetrics(metrics => metrics
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddRuntimeInstrumentation())
            .WithTracing(tracing => tracing
                .AddSource(PlatformActivitySource)
                .AddAspNetCoreInstrumentation(o =>
                {
                    o.Filter = ctx => !ctx.Request.Path.StartsWithSegments(HealthEndpointPath)
                                   && !ctx.Request.Path.StartsWithSegments(AlivenessEndpointPath);
                })
                .AddHttpClientInstrumentation());

        builder.AddOpenTelemetryExporters();

        return builder;
    }

    private static TBuilder AddOpenTelemetryExporters<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        // The Aspire AppHost injects OTEL_EXPORTER_OTLP_ENDPOINT pointing at the dashboard.
        var useOtlpExporter = !string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);

        if (useOtlpExporter)
        {
            builder.Services.AddOpenTelemetry().UseOtlpExporter();
        }

        return builder;
    }

    private static TBuilder AddDefaultHealthChecks<TBuilder>(this TBuilder builder)
        where TBuilder : IHostApplicationBuilder
    {
        builder.Services.AddHealthChecks()
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

        return builder;
    }

    /// <summary>
    /// Maps Aspire's default /health (full health) and /alive (liveness only) endpoints.
    /// Both are filtered out of distributed tracing to keep noise low.
    /// </summary>
    public static WebApplication MapDefaultEndpoints(this WebApplication app)
    {
        // Default health endpoints are only exposed in development to avoid surface area in prod.
        if (app.Environment.IsDevelopment())
        {
            app.MapHealthChecks(HealthEndpointPath);
            app.MapHealthChecks(AlivenessEndpointPath, new HealthCheckOptions
            {
                Predicate = r => r.Tags.Contains("live"),
            });
        }

        return app;
    }
}
