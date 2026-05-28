using Elsa.Studio.Authentication.ElsaIdentity.BlazorServer.Extensions;
using Elsa.Studio.Authentication.ElsaIdentity.HttpMessageHandlers;
using Elsa.Studio.Authentication.ElsaIdentity.UI.Extensions;
using Elsa.Studio.Branding;
using Elsa.Studio.Contracts;
using Elsa.Studio.Core.BlazorServer.Extensions;
using Elsa.Studio.Dashboard.Extensions;
using Elsa.Studio.Extensions;
using Elsa.Studio.Localization.BlazorServer.Extensions;
using Elsa.Studio.Localization.Models;
using Elsa.Studio.Localization.Options;
using Elsa.Studio.Localization.Time;
using Elsa.Studio.Localization.Time.Providers;
using Elsa.Studio.Models;
using Elsa.Studio.Shell.Extensions;
using Elsa.Studio.Translations;
using Elsa.Studio.Workflows.Designer.Extensions;
using Elsa.Studio.Workflows.Extensions;
using MarketingAnalyticsAgentLab.ServiceDefaults;
using MarketingAnalyticsAgentLab.WorkflowDesigner;
using Microsoft.Extensions.DependencyInjection.Extensions;

// Self-hosted Elsa Studio 3.7.0. Matches the layout of the official
// Elsa.Studio.Host.Server template, with two adjustments:
//
//   1. Branding override → "Elsa Studio 3.7.0" instead of the stale "3.6" string the
//      shipped binary hardcodes (DefaultBrandingProvider.AppNameWithVersion).
//   2. Authentication is hardwired to the NEW 3.7.0 ElsaIdentity packages (default
//      admin/password). We don't need OIDC for the POC; a one-time login per browser
//      session is the demo flow.
//
// An earlier attempt to ship Studio without ANY auth module — custom AllowAll auth
// scheme on the backend + no-op IUnauthorizedComponentProvider /
// IHttpConnectionOptionsConfigurator providers in Studio — broke the Workflows
// submenu (it populates via runtime data loads that silently fail without a real
// auth context). We follow the working pattern instead and surface the login as a
// known 5-second hurdle per browser session in the demo banner.
//
// We use the NEW Elsa.Studio.Authentication.ElsaIdentity.* packages rather than the
// legacy Elsa.Studio.Login.* meta-package (the 3.7.0 official template moved away
// from the legacy set; we follow suit).
var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

var configuration = builder.Configuration;

// Fail loudly if Aspire didn't inject Backend__Url — Studio silently swallows API
// failures and debugging the symptom takes hours. The appsettings.json default is
// empty on purpose; the env var IS the source of truth. See AppHost.cs:
//   .WithEnvironment("Backend__Url",
//       ReferenceExpression.Create($"{agentRuntime.GetEndpoint("https")}/elsa/api"))
var resolvedBackendUrl = configuration["Backend:Url"];
if (string.IsNullOrWhiteSpace(resolvedBackendUrl))
{
    throw new InvalidOperationException(
        "Backend:Url is empty. The Aspire AppHost must inject Backend__Url pointing at " +
        "agent-runtime's /elsa/api endpoint. Check the elsa-studio resource's environment " +
        "variables in the Aspire dashboard.");
}

builder.Services.AddRazorPages();
builder.Services.AddServerSideBlazor(options =>
{
    options.RootComponents.RegisterCustomElsaStudioElements();
    options.RootComponents.MaxJSRootComponents = 1000;
});

// Backend wiring. AuthenticationHandler is the new ElsaIdentity handler, which
// automatically attaches the JWT (from the login flow) to every outbound API request.
// Combined with backend's UseDefaultAuthentication, calls are properly authorized.
var backendApiConfig = new BackendApiConfig
{
    ConfigureBackendOptions = options => configuration.GetSection("Backend").Bind(options),
    ConfigureHttpClientBuilder = options =>
    {
        options.AuthenticationHandler = typeof(ElsaIdentityAuthenticatingApiHttpMessageHandler);
        options.ConfigureHttpClient = (_, client) =>
        {
            client.Timeout = TimeSpan.FromHours(1);
        };
    },
};

var localizationConfig = new LocalizationConfig
{
    ConfigureLocalizationOptions = options =>
    {
        configuration.GetSection(LocalizationOptions.LocalizationSection).Bind(options);
        options.SupportedCultures = new[] { options.DefaultCulture }
            .Concat(options.SupportedCultures.Where(culture => culture != options.DefaultCulture) ?? [])
            .ToArray();
    },
};

// AddCore registers the default DefaultBrandingProvider; we swap it for our own to
// fix the stale "Elsa Studio 3.6" label in the sidebar header (the version string is
// hardcoded in the shipped 3.7.0 binary and not updated). Bump the AppNameWithVersion
// in WorkflowDesignerBrandingProvider when ElsaVersion in Directory.Packages.props
// changes.
builder.Services.AddCore().Replace(ServiceDescriptor.Scoped<IBrandingProvider, WorkflowDesignerBrandingProvider>());
builder.Services.AddShell(options => configuration.GetSection("Shell").Bind(options));
builder.Services.AddRemoteBackend(backendApiConfig);

// ElsaIdentity auth (new 3.7.0 API, replaces legacy AddLoginModule + UseElsaIdentity).
// AddElsaIdentity wires up the JWT handler + IHttpConnectionOptionsConfigurator +
// IUnauthorizedComponentProvider. AddElsaIdentityUI registers the login page
// component and routes. Backend's Elsa.Identity (admin/password) issues the JWT.
builder.Services.AddElsaIdentity();
builder.Services.AddElsaIdentityUI();

builder.Services.AddDashboardModule();
builder.Services.AddWorkflowsModule();
builder.Services.AddLocalizationModule(localizationConfig);
builder.Services.AddTranslations();

// ITimeZoneProvider is consumed by DefaultTimeFormatter, which Workflows pages use to
// render timestamp columns. The Login module doesn't register this — it's the one
// dependency we still need to wire manually. LocalTimeZoneProvider follows the
// operator's machine timezone; swap for UtcTimeZoneProvider if server-side consistency
// matters.
builder.Services.AddScoped<ITimeZoneProvider, LocalTimeZoneProvider>();

builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 5 * 1024 * 1000; // 5 MB; matches official template.
});

var app = builder.Build();

// Run Studio's startup tasks BEFORE the request pipeline opens. Modules use
// IStartupTask to register menus, routes, and JS-interop registrations.
using (var startupScope = app.Services.CreateScope())
{
    var startupTaskRunner = startupScope.ServiceProvider.GetRequiredService<IStartupTaskRunner>();
    await startupTaskRunner.RunStartupTasksAsync();
}

app.MapDefaultEndpoints();

if (!app.Environment.IsDevelopment())
{
    app.UseResponseCompression();
    app.UseHsts();
}

app.UseElsaLocalization();
app.UseHttpsRedirection();
// .NET 10 breaking change: blazor.server.js is now ONLY served through the
// MapStaticAssets() endpoint (build-time fingerprinted asset manifest), not the
// legacy UseStaticFiles() middleware. Without MapStaticAssets() the Blazor Server
// circuit never initializes (script returns 404) and every UI interaction in
// Studio — including the Workflows submenu expand — fails silently.
// Tracking issue: https://github.com/dotnet/aspnetcore/issues/66059
// We keep UseStaticFiles() too because Razor Class Library content (`_content/*`,
// e.g. MudBlazor.min.css) still flows through it.
app.UseStaticFiles();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.MapStaticAssets();
app.MapControllers();
app.MapBlazorHub();
app.MapFallbackToPage("/_Host");
app.Run();
