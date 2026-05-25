var builder = DistributedApplication.CreateBuilder(args);

// ---------------------------------------------------------------------------------
// Parameters / secrets
// ---------------------------------------------------------------------------------
// Configure with:
//   dotnet user-secrets --project src\Platform\MarketingAnalyticsAgentLab.AppHost set Parameters:<Name> "<value>"
var azureOpenAiEndpoint   = builder.AddParameter("AzureOpenAIEndpoint");
var azureOpenAiKey        = builder.AddParameter("AzureOpenAIKey", secret: true);
var azureOpenAiDeployment = builder.AddParameter("AzureOpenAIDeployment");

// ---------------------------------------------------------------------------------
// Persistence - Postgres database for AI runtime telemetry (execution events + tool
// calls). pgAdmin is attached so operators can browse rows during demos.
// The database name "aitelemetry" matches the connectionName the Gateway resolves via
// AddNpgsqlDbContext<RuntimeTelemetryDbContext>("aitelemetry").
// A data volume keeps history across AppHost restarts.
//
// The Postgres password is wired through its own named parameter (rather than the
// auto-generated "<resource-name>-password" Aspire creates by default) so renaming
// the resource never desyncs the password from PGDATA in the persisted data volume.
// Set or rotate it with:
//   dotnet user-secrets --project src\Platform\MarketingAnalyticsAgentLab.AppHost ^
//     set Parameters:PostgresPassword "<value>"
// ---------------------------------------------------------------------------------
var postgresPassword = builder.AddParameter("PostgresPassword", secret: true);

var postgres = builder.AddPostgres("postgres-server", password: postgresPassword)
    .WithDataVolume("ai-postgres-data")
    .WithPgAdmin();
var aiTelemetryDb = postgres.AddDatabase("aitelemetry");

// ---------------------------------------------------------------------------------
// Standalone applications - Marketing.
// Each standalone app is an independent set of OpenAPI services that know nothing
// about agents, the gateway, or the platform.
// ---------------------------------------------------------------------------------
var analyticsApi    = builder.AddProject<Projects.MarketingAnalyticsAgentLab_MarketingAnalytics_Api>("analytics-api");
var campaignsApi    = builder.AddProject<Projects.MarketingAnalyticsAgentLab_CampaignManagement_Api>("campaigns-api");
var customersApi    = builder.AddProject<Projects.MarketingAnalyticsAgentLab_CustomerInsights_Api>("customers-api");
var notificationApi = builder.AddProject<Projects.MarketingAnalyticsAgentLab_Notification_Api>("notification-api");

// ---------------------------------------------------------------------------------
// Plugin Registry - the platform's plugin/agent/assistant CRUD service.
// References the internal APIs so the playground can proxy real HTTP calls to them.
// ---------------------------------------------------------------------------------
var pluginRegistry = builder.AddProject<Projects.MarketingAnalyticsAgentLab_PluginRegistry>("plugin-registry")
    .WithReference(analyticsApi).WithReference(campaignsApi)
    .WithReference(customersApi).WithReference(notificationApi);

// ---------------------------------------------------------------------------------
// MCP Server - dynamic plugin loader. Pulls published plugins from PluginRegistry,
// subscribes to /events, and exposes them to agent runtimes via MCP.
// ---------------------------------------------------------------------------------
var mcpServer = builder.AddProject<Projects.MarketingAnalyticsAgentLab_McpServer>("mcp-server")
    .WithReference(pluginRegistry).WaitFor(pluginRegistry)
    .WithReference(analyticsApi).WithReference(campaignsApi)
    .WithReference(customersApi).WithReference(notificationApi);

// ---------------------------------------------------------------------------------
// Agent Runtime - hosts AIAgent instances built from AgentDefinitions, attaches MCP tools,
// and (in Development) serves the Microsoft Agent Framework DevUI dashboard at /devui for
// workflow visualization, trace inspection, and orchestration debugging.
// ---------------------------------------------------------------------------------
var agentRuntime = builder.AddProject<Projects.MarketingAnalyticsAgentLab_AgentRuntime>("agent-runtime")
    .WithReference(mcpServer).WaitFor(mcpServer)
    .WithReference(pluginRegistry).WaitFor(pluginRegistry)
    .WithEnvironment("AzureOpenAI__Endpoint",   azureOpenAiEndpoint)
    .WithEnvironment("AzureOpenAI__ApiKey",     azureOpenAiKey)
    .WithEnvironment("AzureOpenAI__Deployment", azureOpenAiDeployment)
    .WithExternalHttpEndpoints();

// ---------------------------------------------------------------------------------
// AI Assistant Gateway - the single public entry point Atlas calls.
//   POST /assistant/api/interaction/message
// ---------------------------------------------------------------------------------
var aiGateway = builder.AddProject<Projects.MarketingAnalyticsAgentLab_AiAssistantGateway>("ai-gateway")
    .WithReference(agentRuntime).WaitFor(agentRuntime)
    .WithReference(pluginRegistry).WaitFor(pluginRegistry)
    // AI runtime telemetry: connection string is injected under the resource name and
    // resolved at startup by AddNpgsqlDbContext<RuntimeTelemetryDbContext>("aitelemetry").
    .WithReference(aiTelemetryDb).WaitFor(aiTelemetryDb)
    .WithExternalHttpEndpoints();

// ---------------------------------------------------------------------------------
// Admin Portal (React + Vite) - platform admin UI. Manages APIs, Plugins, Agents,
// Assistants. Lives next to the platform services under src/Platform/.
// ---------------------------------------------------------------------------------
builder.AddNpmApp("admin-portal", "../MarketingAnalyticsAgentLab.AdminPortal", "dev")
    .WithReference(pluginRegistry).WithReference(mcpServer)
    .WithReference(agentRuntime).WithReference(aiGateway)
    .WithReference(analyticsApi).WithReference(campaignsApi)
    .WithReference(customersApi).WithReference(notificationApi)
    .WithHttpEndpoint(env: "PORT")
    .WithEnvironment("BROWSER", "none")
    .WithExternalHttpEndpoints()
    .PublishAsDockerFile();

// ---------------------------------------------------------------------------------
// FakeAtlasApp (React + Vite) - lightweight Atlas-style demo client. Lives under
// src/Clients/ to keep demo clients separate from platform services. Calls only
// the AI Gateway endpoint.
// ---------------------------------------------------------------------------------
builder.AddNpmApp("fake-atlas", "../../Clients/MarketingAnalyticsAgentLab.FakeAtlasApp", "dev")
    .WithReference(aiGateway).WaitFor(aiGateway)
    .WithHttpEndpoint(env: "PORT")
    .WithEnvironment("BROWSER", "none")
    .WithExternalHttpEndpoints()
    .PublishAsDockerFile();

// ---------------------------------------------------------------------------------
// NOTE: DevUI is no longer a separate Aspire resource. It's hosted in-process by the
// AgentRuntime (Microsoft.Agents.AI.DevUI package) and served at /devui in Development.
// Click the agent-runtime resource in the Aspire dashboard and navigate to /devui.
// ---------------------------------------------------------------------------------

builder.Build().Run();
