using MarketingAnalyticsAgentLab.MarketingAnalytics.Api.Domain;
using MarketingAnalyticsAgentLab.ServiceDefaults;
using MarketingAnalyticsAgentLab.Shared;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddPlatformAbstractions();
builder.Services.AddOpenApi();
builder.Services.AddSingleton<AnalyticsService>();

var app = builder.Build();

app.UsePlatformCors();
app.MapDefaultEndpoints();
app.MapOpenApi();
if (app.Environment.IsDevelopment())
{
    app.MapScalarApiReference(options => options.WithTitle("Marketing Analytics API"));
}

var analytics = app.MapGroup("/analytics").WithTags("Analytics");

analytics.MapGet("/email-delivery", (AnalyticsService svc, int days = 30) => svc.GetDeliveryReport(days))
    .WithName("GetEmailDeliveryReport")
    .WithSummary("Returns email delivery counts and rates for the trailing window (default 30 days).");

analytics.MapGet("/open-rate", (AnalyticsService svc, int days = 30) => svc.GetOpenRateReport(days))
    .WithName("GetOpenRateReport")
    .WithSummary("Returns email open-rate metrics for the trailing window.");

analytics.MapGet("/click-through", (AnalyticsService svc, int days = 30) => svc.GetClickThroughReport(days))
    .WithName("GetClickThroughReport")
    .WithSummary("Returns email click-through rate metrics for the trailing window.");

analytics.MapGet("/campaigns/{id:guid}/summary", (AnalyticsService svc, Guid id, string? name) =>
        svc.GetCampaignSummary(id, name ?? "(unnamed)"))
    .WithName("GetCampaignSummary")
    .WithSummary("Returns aggregated performance metrics for a specific campaign.");

app.Run();
