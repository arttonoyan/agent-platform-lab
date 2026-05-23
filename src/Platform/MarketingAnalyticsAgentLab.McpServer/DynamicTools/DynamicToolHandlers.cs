using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace MarketingAnalyticsAgentLab.McpServer.DynamicTools;

/// <summary>
/// Bridges MCP list/call requests onto the <see cref="DynamicToolStore"/> so we don't have
/// to know the tool set at compile time. Every plugin-derived tool is delegated through here.
/// </summary>
public static class DynamicToolHandlers
{
    public static ValueTask<ListToolsResult> ListToolsAsync(
        RequestContext<ListToolsRequestParams> ctx,
        CancellationToken ct)
    {
        var store = ctx.Services!.GetRequiredService<DynamicToolStore>();
        var tools = store.List().Select(t => t.Tool.ProtocolTool).ToList();
        return ValueTask.FromResult(new ListToolsResult { Tools = tools });
    }

    public static async ValueTask<CallToolResult> CallToolAsync(
        RequestContext<CallToolRequestParams> ctx,
        CancellationToken ct)
    {
        var store = ctx.Services!.GetRequiredService<DynamicToolStore>();
        var name = ctx.Params?.Name ?? throw new InvalidOperationException("Tool name missing.");
        if (!store.TryGet(name, out var registered) || registered is null)
        {
            return new CallToolResult
            {
                IsError = true,
                Content = [new TextContentBlock { Text = $"Tool '{name}' is not registered." }],
            };
        }
        return await registered.Tool.InvokeAsync(ctx, ct);
    }
}
