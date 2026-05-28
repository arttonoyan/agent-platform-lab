using System.Diagnostics;
using System.Text;
using Elsa.Extensions;
using Elsa.Workflows;
using Elsa.Workflows.Attributes;
using Elsa.Workflows.Models;
using MarketingAnalyticsAgentLab.AgentRuntime.Agents;
using MarketingAnalyticsAgentLab.AgentRuntime.Options;
using MarketingAnalyticsAgentLab.RuntimeTelemetry.Chat;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;

namespace MarketingAnalyticsAgentLab.AgentRuntime.Elsa;

/// <summary>
/// Internal CLR backing type for every dynamically-emitted "Agents/&lt;name&gt;" activity
/// in the Studio palette. <see cref="AgentActivityProvider"/> emits one descriptor per
/// registered agent and binds the agent's frozen name into the descriptor's
/// <c>TypeName</c> (format <c>"Agents.{agentName}"</c>). At execution time we recover the
/// agent name from <see cref="ActivityExecutionContext.Activity"/>'s
/// <see cref="IActivity.Type"/> property and call the live agent through the existing
/// <see cref="RuntimeAgentRegistry"/>.
///
/// NOTE: we deliberately do NOT decorate this class with <c>[Activity]</c>, and we do
/// NOT call <c>elsa.AddActivity&lt;RunAgentActivity&gt;()</c>. Doing either would make a
/// "Run Agent" entry show up in the palette next to the per-agent items (Studio 3.7
/// doesn't reliably honor IsBrowsable on auto-discovered descriptors). The
/// <see cref="AgentActivityProvider"/> is the only thing that registers descriptors for
/// this CLR type — one per agent, all visible.
/// </summary>
public class RunAgentActivity : CodeActivity<string>
{
    [Input(
        DisplayName = "Prompt",
        Description = "The user message sent to the agent for this run. The agent's system instructions / persona come from its YAML definition; this Prompt is what the agent receives as the user turn. Supports workflow expressions, so you can chain prompts from previous activity outputs (e.g. {{ Activities.<previousAgentId>.Result }}).")]
    public Input<string> Prompt { get; set; } = default!;

    protected override async ValueTask ExecuteAsync(ActivityExecutionContext context)
    {
        var prompt = context.Get(Prompt) ?? string.Empty;
        var resolvedName = ExtractAgentNameFromType(context.Activity.Type);

        if (string.IsNullOrWhiteSpace(resolvedName))
        {
            throw new InvalidOperationException(
                $"RunAgentActivity could not resolve an agent name from activity type '{context.Activity.Type}'. " +
                "This activity is created by AgentActivityProvider; if you reach this code path the workflow JSON " +
                "was authored against a stale TypeName — re-open the palette in Studio and re-drag the agent step.");
        }

        var registry = context.GetRequiredService<RuntimeAgentRegistry>();
        if (!registry.TryGet(resolvedName, out var agent) || agent is null)
        {
            throw new InvalidOperationException(
                $"Agent '{resolvedName}' is not registered. " +
                "The agent may have been removed since the workflow was authored — re-open the palette in Studio to refresh.");
        }

        // Mirror the streaming/usage capture pattern used by AgentRunEndpoints so the
        // Elsa journal carries the same telemetry the REST run endpoint records.
        var openAi = context.GetRequiredService<IOptions<AzureOpenAIOptions>>().Value;
        var usage = new TokenUsageAccumulator { ModelId = openAi.Deployment };
        var toolMetadata = registry.GetToolMetadata(resolvedName);
        var toolCalls = new List<(string Tool, string Plugin, int DurationMs)>();
        var argsByCallId = new Dictionary<string, (string Tool, long StartedAtMs)>();
        var text = new StringBuilder();
        var sw = Stopwatch.StartNew();

        using (TokenUsageCapturingChatClient.Capture(usage))
        {
            await foreach (var update in agent.RunStreamingAsync(prompt, cancellationToken: context.CancellationToken))
            {
                foreach (var content in update.Contents)
                {
                    switch (content)
                    {
                        case TextContent t when !string.IsNullOrEmpty(t.Text):
                            text.Append(t.Text);
                            break;
                        case FunctionCallContent call:
                            argsByCallId[call.CallId] = (call.Name, sw.ElapsedMilliseconds);
                            break;
                        case FunctionResultContent result:
                            if (argsByCallId.TryGetValue(result.CallId, out var meta))
                            {
                                toolMetadata.TryGetValue(meta.Tool, out var endpoint);
                                toolCalls.Add((meta.Tool, endpoint?.PluginName ?? "(unknown)", (int)(sw.ElapsedMilliseconds - meta.StartedAtMs)));
                            }
                            break;
                    }
                }
            }
        }
        sw.Stop();

        context.JournalData["agentName"] = resolvedName;
        context.JournalData["model"] = usage.ModelId;
        context.JournalData["inputTokens"] = usage.InputTokens;
        context.JournalData["outputTokens"] = usage.OutputTokens;
        context.JournalData["latencyMs"] = (int)sw.ElapsedMilliseconds;
        context.JournalData["toolCallCount"] = toolCalls.Count;
        if (toolCalls.Count > 0)
        {
            context.JournalData["toolCalls"] = toolCalls
                .Select(tc => new { tool = tc.Tool, plugin = tc.Plugin, durationMs = tc.DurationMs })
                .ToArray();
        }

        context.SetResult(text.ToString());
    }

    /// <summary>
    /// Extracts the agent name from a TypeName of the form <c>"Agents.{name}"</c>.
    /// The provider stamps this on every activity instance it creates.
    /// </summary>
    internal static string? ExtractAgentNameFromType(string? typeName)
    {
        if (string.IsNullOrEmpty(typeName)) return null;
        const string prefix = "Agents.";
        if (!typeName.StartsWith(prefix, StringComparison.Ordinal)) return null;
        var name = typeName[prefix.Length..];
        return string.IsNullOrWhiteSpace(name) ? null : name;
    }
}
