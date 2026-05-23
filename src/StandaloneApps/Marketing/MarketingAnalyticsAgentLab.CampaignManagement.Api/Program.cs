using MarketingAnalyticsAgentLab.CampaignManagement.Api.Domain;
using MarketingAnalyticsAgentLab.ServiceDefaults;
using MarketingAnalyticsAgentLab.Shared;
using MarketingAnalyticsAgentLab.Shared.Contracts;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddPlatformAbstractions();
builder.Services.AddOpenApi();
builder.Services.AddSingleton<CampaignRepository>();

var app = builder.Build();

app.UsePlatformCors();
app.MapDefaultEndpoints();

app.MapOpenApi();
if (app.Environment.IsDevelopment())
{
    app.MapScalarApiReference(options => options.WithTitle("Campaign Management API"));
}

var campaigns = app.MapGroup("/campaigns").WithTags("Campaigns");

campaigns.MapGet("/", (CampaignRepository repo, CampaignStatus? status) =>
        repo.List(status).Select(c => c.ToDto()).ToArray())
    .WithName("ListCampaigns")
    .WithSummary("List all marketing campaigns, optionally filtered by status.");

campaigns.MapGet("/{id:guid}", (CampaignRepository repo, Guid id) =>
        repo.Find(id) is { } c ? Results.Ok(c.ToDto()) : Results.NotFound())
    .WithName("GetCampaign")
    .WithSummary("Get the full detail for a single campaign.");

campaigns.MapPost("/", (CampaignRepository repo, CreateCampaignRequest request) =>
    {
        var created = repo.Create(request);
        return Results.Created($"/campaigns/{created.Id}", created.ToDto());
    })
    .WithName("CreateCampaign")
    .WithSummary("Create a new campaign in draft or scheduled state.");

campaigns.MapPost("/{id:guid}/send", (CampaignRepository repo, Guid id, SendCampaignRequest? request) =>
    {
        request ??= new SendCampaignRequest();
        if (!repo.TrySend(id, request.DryRun, out var campaign))
        {
            return Results.NotFound();
        }
        var response = new SendCampaignResponse(
            CampaignId: campaign!.Id,
            Status: campaign.Status,
            RecipientCount: campaign.AudienceSize,
            DispatchedAt: campaign.SentAt ?? DateTimeOffset.UtcNow);
        return Results.Ok(response);
    })
    .WithName("SendCampaign")
    .WithSummary("Send a campaign now, or simulate the send with dryRun=true.");

app.Run();
