using MarketingAnalyticsAgentLab.McpServer.DynamicTools;
using MarketingAnalyticsAgentLab.McpServer.PluginRegistryClient;
using MarketingAnalyticsAgentLab.McpServer.Registry;
using MarketingAnalyticsAgentLab.ServiceDefaults;
using MarketingAnalyticsAgentLab.Shared;
using MarketingAnalyticsAgentLab.Shared.Abstractions;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddAgentObservability();
builder.Services.AddPlatformAbstractions();

// HttpClient used to call the original internal APIs once a plugin tool is invoked. Aspire's
// service-discovery handler resolves "https+http://<service>" URIs at request time.
builder.Services.AddHttpClient("plugin-invoker");

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

builder.Services.AddSingleton<DynamicToolStore>();
builder.Services.AddSingleton<PluginToolFactory>();
builder.Services.AddSingleton<PluginPolicyEvaluator>();
builder.Services.AddSingleton<InMemoryMcpToolRegistry>();
builder.Services.AddSingleton<IMcpToolRegistry>(sp => sp.GetRequiredService<InMemoryMcpToolRegistry>());

builder.Services.AddHostedService<DynamicPluginToolHost>();

builder.Services
    .AddMcpServer()
    .WithHttpTransport()
    .WithListToolsHandler(DynamicToolHandlers.ListToolsAsync)
    .WithCallToolHandler(DynamicToolHandlers.CallToolAsync);

builder.Services.AddHttpContextAccessor();

var app = builder.Build();

app.UsePlatformCors();
app.MapDefaultEndpoints();

// HTTP MCP endpoints (modern Streamable HTTP transport + SSE).
// IMPORTANT: MapMcp() owns the entire root path ("/") because the Streamable HTTP transport
// uses GET / for the server->client SSE channel and POST / for client->server requests.
// Co-registering any other GET / endpoint causes an AmbiguousMatchException that 500s every
// MCP request, leaves agent-runtime with zero tools, and silently triggers the
// "no plugins attached" guardrail on every agent. Diagnostic / catalog endpoints MUST live
// under sub-paths only.
app.MapMcp();

// Catalog endpoint for AdminPortal: what plugin tools are live in MCP right now.
app.MapGet("/tools", (IMcpToolRegistry registry, string? plugin) =>
        string.IsNullOrWhiteSpace(plugin) ? registry.List() : registry.ListByPlugin(plugin))
    .WithTags("Catalog")
    .WithSummary("List MCP tools currently live, optionally filtered by source plugin.");

// Health/status endpoint (moved off "/" to avoid colliding with MapMcp's GET /).
app.MapGet("/status", (DynamicToolStore store) => new
{
    service = "MarketingAnalyticsAgentLab.McpServer",
    tools = store.List().Select(t => new { plugin = t.PluginName, name = t.Tool.ProtocolTool.Name }).ToArray(),
})
    .WithTags("Catalog")
    .WithSummary("Service-info endpoint. The MCP Streamable HTTP transport owns GET /.");

app.Run();
