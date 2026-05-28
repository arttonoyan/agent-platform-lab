using Elsa.Extensions;
using Elsa.Http.Options;
using Elsa.Identity.Features;
using Elsa.Persistence.EFCore.Extensions;
using Elsa.Persistence.EFCore.Modules.Management;
using Elsa.Persistence.EFCore.Modules.Runtime;
using Elsa.Workflows;

namespace MarketingAnalyticsAgentLab.AgentRuntime.Elsa;

/// <summary>
/// Wires the Elsa Workflows server side-by-side with the existing AgentRuntime. Elsa
/// owns workflow definitions, instances, triggers, and the API the Elsa Studio designer
/// container talks to. Our custom activities (PluginToolActivity, future
/// PluginAgentActivity) live in this same process, so they can call the existing
/// <c>RuntimeAgentRegistry</c> and Tool Runtime without an extra hop.
///
/// Persistence is Postgres-backed via the <c>"elsa"</c> connection string Aspire
/// injects (see AppHost: <c>postgres.AddDatabase("elsa")</c>). Migrations are applied
/// automatically at startup by Elsa's EF Core module — no separate migration step.
///
/// Authentication is the built-in Elsa.Identity module with a default admin/password
/// user. Studio's login UI POSTs to <c>/elsa/api/identity/login</c>, gets a JWT, and
/// uses it for all subsequent calls. This is the same pattern the official Elsa
/// template and the VistaFinance reference both use; an earlier attempt to bypass auth
/// entirely (custom AllowAll scheme + no-op providers in Studio) hit a wall when the
/// Studio Workflows module silently fails to populate menus without a real auth
/// context. We follow the working pattern instead.
///
/// To swap to OIDC (Keycloak, Entra ID, Auth0, etc.), replace UseDefaultAuthentication
/// with UseJwtBearer(...) and configure the identity provider here.
/// </summary>
public static class ElsaHostingExtensions
{
    /// <summary>
    /// Mount point for the Elsa REST API consumed by Elsa Studio. NOTE: must NOT have
    /// a leading slash — <c>UseWorkflowsApi(prefix)</c> concatenates this with the
    /// per-endpoint route; a leading "/" yields "//..." and throws
    /// <c>RoutePatternException</c>.
    /// </summary>
    public const string ElsaApiPrefix = "elsa/api";

    /// <summary>
    /// Base path under which Elsa mounts HTTP Endpoint triggers. We override the package
    /// default ("/workflows") because that conflicts with the platform's own minimal API
    /// at GET /workflows (used by the Automations → Built-in tab to list pre-baked agent
    /// chains). Anything authored in Elsa Studio with an HTTP Endpoint at path "/foo"
    /// becomes reachable at "/triggers/foo".
    /// </summary>
    public const string ElsaHttpBasePath = "/triggers";

    /// <summary>Aspire-injected Postgres connection string name (see AppHost.cs).</summary>
    public const string ElsaConnectionStringName = "elsa";

    /// <summary>
    /// Fixed signing key used for JWT issuance. Long enough to satisfy the 256-bit
    /// minimum HMAC-SHA256 requires. Stable across restarts in dev so the Studio
    /// browser cookie keeps working after an AgentRuntime restart. Rotate via
    /// configuration (Elsa:Identity:SigningKey) before any non-dev deployment.
    /// </summary>
    private const string DevSigningKey = "marketing-analytics-agent-lab-dev-elsa-jwt-signing-key-rotate-me-256bit";

    public static IHostApplicationBuilder AddPlatformElsa(this IHostApplicationBuilder builder)
    {
        var connectionString = builder.Configuration.GetConnectionString(ElsaConnectionStringName)
            ?? throw new InvalidOperationException(
                $"Connection string '{ElsaConnectionStringName}' is not configured. The AppHost must add a Postgres database " +
                "named 'elsa' and reference it from the agent-runtime project for Elsa Workflows to start.");

        // Allow appsettings/env to override the default dev signing key without rebuilding.
        var signingKey = builder.Configuration["Elsa:Identity:SigningKey"] ?? DevSigningKey;

        builder.Services.AddElsa(elsa =>
        {
            // Management = workflow definitions + instances persistence + REST API
            // surface. Runtime = trigger store + bookmark store + execution log
            // persistence. Both share the same Postgres database; Elsa keeps the
            // schemas separated internally.
            elsa.UseWorkflowManagement(management =>
                management.UseEntityFrameworkCore(ef => ef.UsePostgreSql(connectionString)));

            elsa.UseWorkflowRuntime(runtime =>
                runtime.UseEntityFrameworkCore(ef => ef.UsePostgreSql(connectionString)));

            // Identity: register the default admin user (admin / password) and the
            // permissions root role (the "*" wildcard grants every permission). The
            // UseDefaultAdmin call is idempotent — existing rows are left alone, so
            // changing the credentials after first run requires a manual DB update.
            elsa.UseIdentity(identity =>
            {
                identity.TokenOptions = options =>
                {
                    options.SigningKey = signingKey;
                    options.AccessTokenLifetime = TimeSpan.FromDays(1);
                    options.RefreshTokenLifetime = TimeSpan.FromDays(7);
                };
                identity.UseAdminUserProvider();
            });

            // Wires up the JWT bearer scheme. Without this, [Authorize] on Elsa
            // endpoints can't validate the tokens Studio sends.
            elsa.UseDefaultAuthentication();

            // Expression languages that workflow authors use to pipe data between
            // activities (e.g. setting one agent's Prompt to a JS expression that
            // references the previous agent's Result). Without these, the input-mode
            // dropdown in Studio only shows Default/Variable/Input — you can pick a
            // variable but not write a free-form expression.
            elsa.UseJavaScript();
            elsa.UseLiquid();

            // HTTP activity module: HTTP Endpoint trigger (starts a workflow when a
            // matching request hits the host), HTTP Request (outbound call), and HTTP
            // Response (reply to the caller). Triggers are mounted under ElsaHttpBasePath
            // via app.UseWorkflows() — keep it OUTSIDE the /elsa/api prefix so the URL
            // operators publish maps directly to a clean route in Studio. We override the
            // package-default BasePath ("/workflows") because that collides with the
            // platform's own minimal API at GET /workflows.
            elsa.UseHttp(http =>
            {
                http.ConfigureHttpOptions = options =>
                {
                    options.BasePath = ElsaHttpBasePath;
                };
            });

            // Elsa Studio talks to this API; we mount it under /elsa/api in the
            // request pipeline below via app.UseWorkflowsApi().
            elsa.UseWorkflowsApi();

            // Pattern A: one generic "Invoke Tool" activity. The operator picks the
            // tool by name in Studio and supplies arguments as JSON. Every Tool Set
            // tool published in PluginRegistry is reachable via this activity without
            // any further code changes.
            //
            // Pattern B (one palette item per tool, typed inputs derived from the
            // OpenAPI parameters) is a planned upgrade and would replace this call
            // with an IActivityProvider that emits descriptors on demand.
            elsa.AddActivity<PluginToolActivity>();

            // Agents-as-activities. Note we do NOT call elsa.AddActivity<RunAgentActivity>().
            // RunAgentActivity is an unattributed implementation type; if we registered it
            // via AddActivity Elsa would auto-discover it and Studio's palette would show a
            // confusing generic "Run Agent" entry next to the per-agent items (Studio 3.7
            // doesn't reliably honor IsBrowsable on auto-discovered descriptors). Instead,
            // AgentActivityProvider produces every descriptor — one per agent — and they
            // all share RunAgentActivity as their ClrType, so the deserialization /
            // execution path still finds the right CLR class.
            // ActivityRegistryRefreshOnAgentChange listens to PluginRegistry events and
            // republishes the dynamic descriptors when agents/plugins change.
        });

        // Service that bridges Elsa activities to the platform's published Tool Sets.
        // Registered as a singleton because the registry client it depends on is
        // singleton and the runner itself holds no per-request state.
        builder.Services.AddSingleton<IPluginToolRunner, PluginToolRunner>();
        builder.Services.AddHttpClient("elsa-tool-runner");

        // Agents-as-activities wiring.
        //
        // Lifetime: Elsa's IActivityRegistry is a SINGLETON and resolves IActivityProvider
        // from the root container. AgentActivityProvider's dependencies (IAgentRegistry,
        // IActivityDescriber) are also singletons, so singleton lifetime is the right fit
        // and avoids the "Cannot consume scoped service from singleton" validation error.
        //
        // Registered twice — once as itself (so the refresh hosted service can pull the
        // exact instance) and once as IActivityProvider (so Elsa's descriptor sweep
        // discovers it). The factory delegate makes both resolutions return the same
        // singleton.
        builder.Services.AddSingleton<AgentActivityProvider>();
        builder.Services.AddSingleton<IActivityProvider>(sp => sp.GetRequiredService<AgentActivityProvider>());
        builder.Services.AddHostedService<ActivityRegistryRefreshOnAgentChange>();

        // Workflows-as-agents wiring. Published workflows declaring a `prompt` input and
        // `response` output are bridged into a synthetic agent surface so they appear in
        // the unified /agents listing alongside simple YAML agents. WorkflowAgentRegistry
        // is the cache the dispatch endpoint reads from; WorkflowAgentBridge keeps it in
        // sync with Elsa's published-workflow list.
        //
        // Registered TWICE — once as itself (so the /agents/composite/diagnose endpoint
        // can resolve it from DI to run an ad-hoc scan) and once as IHostedService for
        // the periodic poll loop. The factory delegate makes both registrations resolve
        // to the same singleton instance, so a diagnose call and the background loop
        // share the same cache.
        builder.Services.AddSingleton<WorkflowAgentRegistry>();
        builder.Services.AddSingleton<WorkflowAgentBridge>();
        builder.Services.AddHostedService(sp => sp.GetRequiredService<WorkflowAgentBridge>());

        // Scaffold service backing the "+ New agent → Workflow" creation flow in the
        // AdminPortal. Scoped because IWorkflowDefinitionImporter participates in
        // EF Core scopes — registering this scoped keeps the importer's DbContext
        // resolution scoped per request.
        builder.Services.AddScoped<CompositeAgentScaffoldService>();

        return builder;
    }

    /// <summary>
    /// Maps the Elsa REST API at <see cref="ElsaApiPrefix"/>. Call after
    /// <c>UseRouting</c> + <c>UsePlatformCors</c> in the request pipeline so the
    /// Studio iframe can call the API from the operator's browser.
    /// </summary>
    public static WebApplication MapPlatformElsa(this WebApplication app)
    {
        // UseAuthentication must precede UseAuthorization, and both must run before
        // UseWorkflowsApi so the JWT bearer scheme registered by UseDefaultAuthentication
        // gets a chance to validate Studio's Authorization header.
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseWorkflowsApi(ElsaApiPrefix);

        // UseWorkflows() installs the HTTP-trigger middleware. Without it, the
        // HttpEndpoint activity registers a path in Elsa's trigger store but no
        // ASP.NET middleware matches the incoming request to that trigger — the
        // caller gets a 404. Runs AFTER auth so HttpEndpoint can opt in to
        // [Authorize] semantics when an operator wants to gate a workflow.
        app.UseWorkflows();
        return app;
    }
}
