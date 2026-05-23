using MarketingAnalyticsAgentLab.PluginRegistry.Endpoints;
using MarketingAnalyticsAgentLab.PluginRegistry.Events;
using MarketingAnalyticsAgentLab.PluginRegistry.OpenApi;
using MarketingAnalyticsAgentLab.PluginRegistry.Seeding;
using MarketingAnalyticsAgentLab.PluginRegistry.Storage;
using MarketingAnalyticsAgentLab.ServiceDefaults;
using MarketingAnalyticsAgentLab.Shared;
using MarketingAnalyticsAgentLab.Shared.Agents;
using MarketingAnalyticsAgentLab.Shared.Assistants;
using MarketingAnalyticsAgentLab.Shared.Plugins;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddPlatformAbstractions();
builder.Services.AddOpenApi();

builder.Services.Configure<PluginRegistryOptions>(builder.Configuration.GetSection(PluginRegistryOptions.SectionName));

builder.Services.AddSingleton<IPluginRegistryStore, FileSystemPluginStore>();
builder.Services.AddSingleton<IAgentDefinitionStore, FileSystemAgentDefinitionStore>();
builder.Services.AddSingleton<IAssistantRegistry, FileSystemAssistantRegistry>();
builder.Services.AddSingleton<PluginRegistryEventBus>();
builder.Services.AddSingleton<OpenApiImporter>();

// HttpClient used to fetch OpenAPI documents from internal APIs and proxy playground calls.
// Resolved through Aspire service discovery, so https+http://<service-name> works.
builder.Services.AddHttpClient("api-spec-fetch");
builder.Services.AddHttpClient("playground");

builder.Services.AddHostedService<SeedDataLoader>();

var app = builder.Build();

app.UsePlatformCors();
app.MapDefaultEndpoints();
app.MapOpenApi();
if (app.Environment.IsDevelopment())
{
    app.MapScalarApiReference(options => options.WithTitle("Marketing Analytics Agent Lab - Plugin Registry"));
}

app.MapApiSpecEndpoints();
app.MapPluginEndpoints();
app.MapAgentDefinitionEndpoints();
app.MapAssistantEndpoints();
app.MapEventsEndpoint();

app.MapGet("/", () => new
{
    service = "MarketingAnalyticsAgentLab.PluginRegistry",
    endpoints = new[] { "/apis", "/plugins", "/agents", "/assistants", "/events" },
});

app.Run();
