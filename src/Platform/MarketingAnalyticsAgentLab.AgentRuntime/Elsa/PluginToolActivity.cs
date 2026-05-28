using Elsa.Extensions;
using Elsa.Workflows;
using Elsa.Workflows.Attributes;
using Elsa.Workflows.Models;

namespace MarketingAnalyticsAgentLab.AgentRuntime.Elsa;

/// <summary>
/// Generic "Invoke Tool" workflow activity. Pattern A from the Workflows IA discussion:
/// one activity in the palette, the operator picks the tool by name and supplies
/// arguments as a JSON object. Every Tool Set tool published in PluginRegistry is
/// reachable this way without any additional code changes.
///
/// Pattern B (one descriptor per tool, typed input fields per OpenAPI parameter) is
/// the planned Week-2 upgrade — it requires a custom <c>IActivityProvider</c> that
/// emits descriptors per tool. For now the activity stays simple and the registry
/// stays the source of truth at execution time.
/// </summary>
[Activity(
    "Platform",
    "Platform.InvokeTool",
    DisplayName = "Invoke Tool",
    Description = "Calls a published Tool Set tool through the platform's Tool Runtime. " +
                  "Pick a tool by name and supply arguments as a JSON object.")]
public class PluginToolActivity : CodeActivity<string>
{
    [Input(
        DisplayName = "Tool name",
        Description = "The name of the published tool to call, e.g. 'get_open_rate'. Only tools whose Tool Set is Published are reachable.")]
    public Input<string> ToolName { get; set; } = default!;

    [Input(
        DisplayName = "Arguments (JSON)",
        Description = "Tool arguments as a JSON object. Schema mirrors the tool's OpenAPI parameters.")]
    public Input<string> Arguments { get; set; } = new("{}");

    protected override async ValueTask ExecuteAsync(ActivityExecutionContext context)
    {
        var toolName = context.Get(ToolName) ?? string.Empty;
        var argsJson = context.Get(Arguments) ?? "{}";

        var runner = context.GetRequiredService<IPluginToolRunner>();
        var result = await runner.InvokeAsync(toolName, argsJson, context.CancellationToken);

        // Surface every invocation in the Elsa execution log so operators see exactly
        // what the workflow did, even when nothing downstream reads the result.
        context.JournalData["toolName"]    = result.ToolName;
        context.JournalData["pluginName"]  = result.PluginName;
        context.JournalData["statusCode"]  = result.StatusCode;
        context.JournalData["durationMs"]  = result.DurationMs;
        if (result.Error is not null)
        {
            context.JournalData["error"] = result.Error;
        }

        // Always set Result so downstream activities can read it; on failure the body
        // is empty but the JournalData carries the error message.
        context.SetResult(result.Body);
    }
}
