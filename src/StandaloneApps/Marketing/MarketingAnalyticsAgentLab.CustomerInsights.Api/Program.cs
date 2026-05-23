using MarketingAnalyticsAgentLab.CustomerInsights.Api.Domain;
using MarketingAnalyticsAgentLab.ServiceDefaults;
using MarketingAnalyticsAgentLab.Shared;
using MarketingAnalyticsAgentLab.Shared.Contracts;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.Services.AddPlatformAbstractions();
builder.Services.AddOpenApi();
builder.Services.AddSingleton<CustomerStore>();

var app = builder.Build();

app.UsePlatformCors();
app.MapDefaultEndpoints();
app.MapOpenApi();
if (app.Environment.IsDevelopment())
{
    app.MapScalarApiReference(options => options.WithTitle("Customer Insights API"));
}

var customers = app.MapGroup("/customers").WithTags("Customers");

customers.MapGet("/", (CustomerStore store, LifecycleStage? stage, int take = 25) => store.ListCustomers(stage, take))
    .WithName("ListCustomers")
    .WithSummary("List customers (default 25), optionally filtered by lifecycle stage.");

customers.MapGet("/{id:guid}", (CustomerStore store, Guid id) =>
        store.FindCustomer(id) is { } customer ? Results.Ok(customer) : Results.NotFound())
    .WithName("GetCustomer")
    .WithSummary("Look up a single customer profile by ID.");

var segments = app.MapGroup("/segments").WithTags("Segments");

segments.MapGet("/", (CustomerStore store) => store.ListSegments())
    .WithName("ListSegments")
    .WithSummary("List marketing segments with size and criteria summary.");

segments.MapGet("/{id:guid}/customers", (CustomerStore store, Guid id, int take = 20) =>
        store.ListCustomersInSegment(id, take))
    .WithName("ListCustomersInSegment")
    .WithSummary("List a sample of customers that belong to the segment.");

app.Run();
