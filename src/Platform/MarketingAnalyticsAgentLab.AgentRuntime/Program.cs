using MarketingAnalyticsAgentLab.AgentRuntime.Agents;
using MarketingAnalyticsAgentLab.AgentRuntime.AiPlayground;
using MarketingAnalyticsAgentLab.AgentRuntime.DevUi;
using MarketingAnalyticsAgentLab.AgentRuntime.Elsa;
using MarketingAnalyticsAgentLab.AgentRuntime.Endpoints;
using MarketingAnalyticsAgentLab.AgentRuntime.Options;
using MarketingAnalyticsAgentLab.AgentRuntime.PluginRegistryClient;
using MarketingAnalyticsAgentLab.AgentRuntime.Workflows;
using MarketingAnalyticsAgentLab.ServiceDefaults;
using MarketingAnalyticsAgentLab.Shared;
using MarketingAnalyticsAgentLab.Shared.Abstractions;
using Microsoft.Agents.AI.DevUI;
using Microsoft.Agents.AI.Hosting.OpenAI;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddAgentObservability();
builder.Services.AddPlatformAbstractions();
builder.Services.AddOpenApi();

builder.Services.Configure<AzureOpenAIOptions>(builder.Configuration.GetSection(AzureOpenAIOptions.SectionName));

// HttpClient for MCP traffic - Aspire service-discovery resolves "https+http://mcp-server".
builder.Services.AddHttpClient("mcp", client =>
{
    var baseUrl = builder.Configuration["Mcp:BaseUrl"] ?? "https+http://mcp-server";
    client.BaseAddress = new Uri(baseUrl);
});

// HttpClient for talking to PluginRegistry: split into two named clients so the long-lived
// /events SSE stream can opt out of the standard resilience handler's per-attempt timeout
// (which would otherwise tear the stream down every 10 seconds).
var pluginRegistryBase = new Uri(builder.Configuration["PluginRegistry:BaseUrl"] ?? "https+http://plugin-registry");
builder.Services.AddHttpClient(PluginRegistryClient.CrudClientName, c => c.BaseAddress = pluginRegistryBase);
builder.Services.AddHttpClient(PluginRegistryClient.EventsClientName, c =>
{
    c.BaseAddress = pluginRegistryBase;
    c.Timeout = Timeout.InfiniteTimeSpan;
})
    .RemoveAllResilienceHandlers();
builder.Services.AddSingleton<IPluginRegistryClient, PluginRegistryClient>();

builder.Services.AddSingleton<RuntimeAgentRegistry>();
builder.Services.AddSingleton<IAgentRegistry>(sp => sp.GetRequiredService<RuntimeAgentRegistry>());
builder.Services.AddSingleton<AgentLifecycleService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<AgentLifecycleService>());

// AI Playground: lets the Admin Portal drive one-off LLM-grounded test runs against any
// plugin (draft or published) using its current tool name + description. Single tenant
// of Azure OpenAI - reuses the same options the AgentLifecycleService configures.
builder.Services.AddSingleton<PluginAiPlaygroundService>();
builder.Services.AddHttpClient("ai-playground-downstream");

// Multi-agent workflows catalog. Today this is a static list of one built-in
// (CampaignInsightsWorkflow); when a WorkflowDefinition store lands in PluginRegistry
// we just point this at it and the Admin Portal page works unchanged.
builder.Services.AddSingleton<WorkflowCatalog>();

// ---------------------------------------------------------------------------------------------
// Elsa Workflows server. Self-hosted alongside AgentRuntime so our custom InvokeTool activity
// can call the platform's Tool Runtime in-process. Persistence is the Aspire-provisioned
// "elsa" Postgres database; the Studio designer runs as a separate Aspire container and
// reaches this server via the /elsa/api endpoint mapped further down in the pipeline.
// ---------------------------------------------------------------------------------------------
builder.AddPlatformElsa();

// ---------------------------------------------------------------------------------------------
// Microsoft Agent Framework DevUI - runtime debugging surface. Adds OpenAI Responses +
// Conversations + DevUI dashboard. Development-only to keep production attack surface minimal.
// ---------------------------------------------------------------------------------------------
if (builder.Environment.IsDevelopment())
{
    builder.AddPlatformDevUi();
}

var app = builder.Build();

app.UsePlatformCors();
app.MapDefaultEndpoints();
app.MapOpenApi();
if (app.Environment.IsDevelopment())
{
    app.MapScalarApiReference(options => options.WithTitle("Marketing Analytics Agent Lab - Agent Runtime"));
}

app.MapAgentRunEndpoints();
app.MapPluginPlaygroundEndpoints();
app.MapWorkflowEndpoints();
app.MapPlatformElsa();

if (app.Environment.IsDevelopment())
{
    // DevUI eagerly resolves every registered agent at MapDevUI() time, so we must have a
    // populated RuntimeAgentRegistry BEFORE mapping the route. Prime the agents synchronously
    // here; the background AgentLifecycleService then takes over for hot-reloads on
    // PluginRegistry events.
    var lifecycle = app.Services.GetRequiredService<AgentLifecycleService>();
    using var primeCts = new CancellationTokenSource(TimeSpan.FromSeconds(120));
    try
    {
        await lifecycle.PrimeAsync(primeCts.Token);
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "AgentRuntime priming failed; DevUI agents will fall back to error stubs.");
    }

    // OpenAI-compatible Responses + Conversations APIs (consumed by DevUI's frontend) and the
    // DevUI dashboard itself. The dashboard lives at /devui.
    app.MapOpenAIResponses();
    app.MapOpenAIConversations();
    app.MapDevUI();
}

app.MapGet("/", (RuntimeAgentRegistry registry) => new
{
    service = "MarketingAnalyticsAgentLab.AgentRuntime",
    agents = registry.List().Select(a => a.Name).ToArray(),
    devUi = "/devui",
});

app.Run();
