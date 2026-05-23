using MarketingAnalyticsAgentLab.Notification.Api.Domain;
using MarketingAnalyticsAgentLab.ServiceDefaults;
using MarketingAnalyticsAgentLab.Shared;
using MarketingAnalyticsAgentLab.Shared.Contracts;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddPlatformAbstractions();
builder.Services.AddOpenApi();
builder.Services.AddSingleton<NotificationStore>();

var app = builder.Build();

app.UsePlatformCors();
app.MapDefaultEndpoints();
app.MapOpenApi();
if (app.Environment.IsDevelopment())
{
    app.MapScalarApiReference(options => options.WithTitle("Notification API"));
}

var notifications = app.MapGroup("/notifications").WithTags("Notifications");

notifications.MapPost("/email/send", (NotificationStore store, SendEmailRequest request) =>
    {
        var notification = store.Enqueue("email", request.ToEmail, request.CampaignId);
        return Results.Accepted($"/notifications/{notification.Id}", notification);
    })
    .WithName("SendEmailNotification")
    .WithSummary("Enqueue a transactional email. Returns the notification descriptor.");

notifications.MapPost("/sms/send", (NotificationStore store, SendSmsRequest request) =>
    {
        var notification = store.Enqueue("sms", request.ToPhoneNumber, request.CampaignId);
        return Results.Accepted($"/notifications/{notification.Id}", notification);
    })
    .WithName("SendSmsNotification")
    .WithSummary("Enqueue a transactional SMS. Returns the notification descriptor.");

notifications.MapGet("/{id:guid}", (NotificationStore store, Guid id) =>
        store.Find(id) is { } n ? Results.Ok(n) : Results.NotFound())
    .WithName("GetNotificationStatus")
    .WithSummary("Look up the delivery status of a previously-enqueued notification.");

app.Run();
