using MarketingAnalyticsAgentLab.AiAssistantGateway.Clients;
using MarketingAnalyticsAgentLab.AiAssistantGateway.Endpoints;
using MarketingAnalyticsAgentLab.AiAssistantGateway.Routing;
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

var app = builder.Build();

app.UsePlatformCors();
app.MapDefaultEndpoints();
app.MapOpenApi();
if (app.Environment.IsDevelopment())
{
    app.MapScalarApiReference(options => options.WithTitle("AI Assistant Gateway"));
}

app.MapAssistantInteractionEndpoints();

app.MapGet("/", () => new
{
    service = "MarketingAnalyticsAgentLab.AiAssistantGateway",
    mainEndpoint = "POST /assistant/api/interaction/message",
});

app.Run();
