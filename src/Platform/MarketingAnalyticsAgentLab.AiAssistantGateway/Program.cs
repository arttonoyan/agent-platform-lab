using MarketingAnalyticsAgentLab.AiAssistantGateway.Clients;
using MarketingAnalyticsAgentLab.AiAssistantGateway.Endpoints;
using MarketingAnalyticsAgentLab.AiAssistantGateway.Routing;
using MarketingAnalyticsAgentLab.RuntimeTelemetry;
using MarketingAnalyticsAgentLab.ServiceDefaults;
using MarketingAnalyticsAgentLab.Shared;
using MarketingAnalyticsAgentLab.Shared.Interaction;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddPlatformAbstractions();
builder.Services.AddOpenApi();

// Typed clients resolved through Aspire service discovery.
builder.Services.AddHttpClient<IAgentRuntimeClient, AgentRuntimeClient>(c =>
    c.BaseAddress = new Uri(builder.Configuration["AgentRuntime:BaseUrl"] ?? "https+http://agent-runtime"));
builder.Services.AddHttpClient<IAssistantRegistryClient, AssistantRegistryClient>(c =>
    c.BaseAddress = new Uri(builder.Configuration["PluginRegistry:BaseUrl"] ?? "https+http://plugin-registry"));

builder.Services.AddSingleton<IAgentRouter, RuleBasedAgentRouter>();

// -----------------------------------------------------------------------------
// AI runtime telemetry persistence (Postgres + EF Core via Aspire).
//
// The AppHost provisions a Postgres database resource named "aitelemetry" and wires
// the connection string into this service. The Aspire client integration registers
// RuntimeTelemetryDbContext as scoped, adds health checks, OTel instrumentation, and
// the standard resilience policies for the Npgsql data source.
//
// AddRuntimeTelemetry() layers the pricing service + IExecutionEventStore on top.
// The schema is created at startup via EnsureRuntimeTelemetrySchemaAsync() — fine for
// a POC; replace with `MigrateAsync` once migrations are introduced.
// -----------------------------------------------------------------------------
builder.AddNpgsqlDbContext<RuntimeTelemetryDbContext>(connectionName: "aitelemetry");
builder.Services.AddRuntimeTelemetry();

var app = builder.Build();

app.UsePlatformCors();
app.MapDefaultEndpoints();
app.MapOpenApi();
if (app.Environment.IsDevelopment())
{
    app.MapScalarApiReference(options => options.WithTitle("AI Assistant Gateway"));
}

app.MapAssistantInteractionEndpoints();
app.MapTelemetryEndpoints();

app.MapGet("/", () => new
{
    service = "MarketingAnalyticsAgentLab.AiAssistantGateway",
    mainEndpoint = "POST /assistant/api/interaction/message",
    telemetryEndpoint = "GET /telemetry/events",
});

// Best-effort schema bootstrap. Failure here is logged but does not block startup —
// the Gateway can still serve /assistant traffic; only telemetry persistence will fail.
await app.EnsureRuntimeTelemetrySchemaAsync();

app.Run();
