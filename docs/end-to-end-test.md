# End-to-End Test Guide

This guide walks through the full platform pipeline: **Import an OpenAPI → configure a plugin → publish → attach to an agent → test in DevUI → test from FakeAtlasApp → inspect traces**.

It uses the seeded Marketing standalone app and the two seeded agents (`MarketingAnalyticsAgent`, `CampaignOptimizationAgent`). No code changes required.

Estimated time: ~10 minutes.

---

## Prerequisites

- AppHost is configured and runs (Azure OpenAI in user-secrets, npm dependencies installed). See the [README quick start](../README.md#quick-start) if you haven't done that yet.
- Open the solution in Visual Studio, set `MarketingAnalyticsAgentLab.AppHost` as the startup project, press **F5**.
- The Aspire dashboard opens automatically at `https://localhost:17100`.

Wait until every resource in the dashboard is **Running** (green) before continuing.

---

## Step 1 — Open the Admin Portal

In the Aspire dashboard, click the **admin-portal** row to launch the operator console in a new tab. You'll see five sections in the left sidebar:

- **APIs** — OpenAPI Importer
- **Plugins** — configured groupings of API operations
- **Agents** — lightweight agent metadata
- **Assistants** — public identities Atlas calls
- **Activity** — live SSE feed of registry events
- **Settings** — resolved service URLs (incl. the DevUI link)

There is also an **Open DevUI** card at the bottom of the sidebar — keep that handy.

---

## Step 2 — Import two OpenAPI specs

The platform ships with four Marketing standalone APIs. For this guide we'll wire up two of them: the **Marketing Analytics API** (read-only metrics) and the **Campaign Management API** (campaigns CRUD).

1. Click **APIs** in the sidebar.
2. Under "Internal Marketing APIs" click **Import** next to:
   - **Marketing Analytics API**
   - **Campaign Management API**
3. Both will appear in the "Imported specs" list below. Each row shows the count of discovered operations (e.g. *4 operations* / *4 operations*).

> Behind the scenes, the **OpenAPI Importer** in `PluginRegistry` fetched each spec from `/openapi/v1.json` on the corresponding service and stored it as JSON in the `data/api-specs/` folder.

---

## Step 3 — Create the first plugin: `MarketingAnalyticsPlugin`

1. Click the **Marketing Analytics API** row.
2. In the operation table on the left, tick **all 4 operations**:
   - `GetEmailDeliveryReport`
   - `GetOpenRateReport`
   - `GetClickThroughReport`
   - `GetCampaignSummary`
3. On the right card, fill in:
   - **Plugin name**: `MarketingAnalyticsPlugin`
   - **Description**: `Read-only delivery, open-rate, CTR, and per-campaign performance reports.`
4. Click **Create plugin**.

You'll be taken to the plugin detail page with four tabs: **Operations**, **Auth**, **Permissions**, **Playground**.

### Configure tool names

Switch to the **Operations** tab. Each endpoint has a generated `Tool name` that the agent will see. Rename them to be more conversational (these names appear directly in the LLM prompt):

| OperationId | Suggested Tool name | Suggested Tool description |
| --- | --- | --- |
| `GetEmailDeliveryReport` | `get_email_delivery` | Get email delivery counts (sent / delivered / bounced) for the trailing N days. |
| `GetOpenRateReport`     | `get_open_rate`      | Get overall open rate and daily open-rate series for the trailing N days. |
| `GetClickThroughReport` | `get_click_through`  | Get click-through-rate metrics and daily series for the trailing N days. |
| `GetCampaignSummary`    | `get_campaign_summary` | Get aggregated open / click / unsubscribe metrics for a specific campaign by id. |

Click **Save** in the header.

---

## Step 4 — Test the plugin in the Playground

Before publishing, validate the plugin actually calls the real API.

1. Switch to the **Playground** tab.
2. Select operation: `GetOpenRateReport`.
3. Set parameter `days` to `14`.
4. Click **Run**.

You should see a `200` response in **~30–60 ms** with a JSON body like:

```json
{
  "from": "2026-05-02",
  "to": "2026-05-15",
  "overallOpenRate": 0.2871,
  "dailyOpenRate": [...]
}
```

> The Playground proxies an **actual HTTP call** to `analytics-api` — there's no agent in the loop yet. This proves the plugin is wired correctly.

---

## Step 5 — Publish the plugin

Click **Publish** in the page header. The status pill changes from **Draft** to **Published**.

Switch to the **Activity** page in the sidebar. You'll see a `plugin.published` event arrive in real time:

```
plugin.published    MarketingAnalyticsPlugin    01:24:13
```

And in the "Live MCP tools" panel on the right, four new MCP tools appear within a second:

```
get_email_delivery     plugin: MarketingAnalyticsPlugin
get_open_rate          plugin: MarketingAnalyticsPlugin
get_click_through      plugin: MarketingAnalyticsPlugin
get_campaign_summary   plugin: MarketingAnalyticsPlugin
```

> The McpServer is subscribed to PluginRegistry's `/events` SSE stream and just hot-loaded the new tools into MCP. No restarts.

---

## Step 6 — Create a second plugin: `CampaignManagementPlugin` (optional but recommended)

Repeat steps 3 and 5 for the **Campaign Management API**:

1. **APIs** → click the **Campaign Management API** row.
2. Tick all 4 operations: `ListCampaigns`, `GetCampaign`, `CreateCampaign`, `SendCampaign`.
3. Plugin name: `CampaignManagementPlugin`. Description: `Browse and operate marketing campaigns. Use SendCampaign with dryRun=true to validate audience size without sending.`
4. Suggested tool name overrides:
   - `ListCampaigns` → `get_campaigns`
   - `GetCampaign` → `get_campaign_details`
   - `CreateCampaign` → `create_campaign`
   - `SendCampaign` → `send_campaign`
5. Save → Publish.

The Activity page should now show 8 live MCP tools total (4 from each plugin).

---

## Step 7 — Attach plugins to an agent

1. Click **Agents** in the sidebar.
2. Click **Edit metadata** on the `MarketingAnalyticsAgent` card.
3. The seeded values are already sensible, but you can paste the recommended copy below to keep your demo consistent with the documentation. The three fields that matter for routing + LLM behaviour:

   **`MarketingAnalyticsAgent`**

   - **Description**
     > Summarises campaign performance, surfaces anomalies, and explains analytics trends. Read-only.
   - **Routing hints (comma separated)** — match user phrases the Gateway router can use to pick this agent
     ```text
     open rate, delivery, click-through, CTR, summary, anomaly, trend, engagement, performance, last week, last 30 days
     ```
   - **Instructions** — the system prompt the agent runs with
     ```text
     You are the Marketing Analytics Agent for a ServiceTitan-style marketing platform.

     Your job:
       - Help the user understand campaign performance: open rate, delivery rate, CTR, anomalies.
       - Always call the provided plugin tools to get real numbers rather than guessing.
       - Quote concrete numbers and date windows in your answers (e.g. "last 14 days, open rate 28.7%").
       - Surface anomalies (sharp drops or spikes vs the trailing average) without being asked.

     Tone: concise, data-driven, professional. Avoid hedging when the data is clear.
     If a tool fails or returns no data, say so plainly and suggest a next step.
     ```

4. In the **Plugins** section at the bottom of the modal, tick **both** plugins:
   - **MarketingAnalyticsPlugin** — the agent's primary toolset.
   - **CampaignManagementPlugin** — so the agent can look up which campaigns the user is asking about by name or status before fetching metrics.

   > **About plugin granularity.** The modal attaches **plugins**, not individual tools. If you wanted the analytics agent to be strictly forbidden from calling `send_campaign`, you would split `CampaignManagementPlugin` into two plugins at authoring time (e.g. a read-only `CampaignsReadPlugin` with just `get_campaigns` + `get_campaign_details`, and a separate `CampaignsWritePlugin` with `send_campaign`), then attach only the read one here. For this demo the instructions below carry the safety rules instead.

5. Click **Save metadata**. The modal closes.
6. Now do the same for **`CampaignOptimizationAgent`** with a different focus and an explicit safety rule about sending campaigns:

   - **Description**
     > Proposes subject lines, segments, and send-times to lift performance, grounded in analytics data.
   - **Routing hints (comma separated)**
     ```text
     optimize, improve, recommendation, low open rate, subject line, segment, send time, audience, lift, test
     ```
   - **Instructions**
     ```text
     You are the Campaign Optimization Agent for a ServiceTitan-style marketing platform.

     Your job:
       - Recommend concrete optimisations for upcoming and recent campaigns: subject lines,
         send-time windows, segment selection, channel mix.
       - Ground every recommendation in metrics from the analytics tools - never guess.
       - Use the campaign management tools to look up draft/scheduled campaigns.
       - When asked, you may call send_campaign with dryRun=true to validate audience size;
         NEVER call it with dryRun=false unless the user explicitly says "send it now".

     Format final answers as a short bulleted list of actions, with one-sentence rationale each.
     ```
   - Plugins: tick **both** MarketingAnalyticsPlugin and CampaignManagementPlugin — this agent reads analytics AND operates campaigns (gated by the `dryRun=true` rule in its instructions above).

7. Click **Reload AgentRuntime** in the page header. Both status pills switch to **live** within a couple of seconds, showing their tool counts.

> The save fires an `agent.changed` event in PluginRegistry. The AgentLifecycleService in AgentRuntime hot-rebuilds the agent with the new plugin's MCP tools attached. **No process restart.**

> **Routing hints in action.** When FakeAtlasApp sends *"Find campaigns with **low open rate**"*, the Gateway's rule-based router matches the substring `low open rate` against `CampaignOptimizationAgent`'s hints (highest specificity wins over `open rate` on the analytics agent) and routes there. The `routerReason` field in the response will say `matched hint 'low open rate' on CampaignOptimizationAgent`.

---

## Step 8 — Test the agent in DevUI

DevUI is the platform's runtime debugging surface.

1. In the Admin Portal sidebar, click **Open DevUI** (bottom-left card). It opens `<agent-runtime>/devui` in a new tab.
2. In the DevUI sidebar you should see two agents: `MarketingAnalyticsAgent` and `CampaignOptimizationAgent`. Pick `MarketingAnalyticsAgent`.
3. Type into the chat input:
   > **"Show me the email open rate for the last 14 days."**
4. Send. You should see:
   - The agent's streaming reply with concrete numbers from the API.
   - A **Tool calls** panel listing `get_open_rate` with the JSON arguments and result.
   - A **Trace** panel showing the OpenTelemetry spans (chat completion → tool call → HTTP request to `analytics-api` → response).

Try a few more queries to exercise different tools:

| Prompt | Expected tool(s) |
| --- | --- |
| *"What's the email delivery rate for the trailing 30 days?"* | `get_email_delivery` |
| *"Summarize click-through performance for this month."* | `get_click_through` |
| *"List all marketing campaigns, then look up the one with the highest audience."* | `get_campaigns`, `get_campaign_details` |
| *"Identify campaigns whose open rate dropped vs the trailing average."* | `get_campaigns` then `get_open_rate` |

If any tool call fails, the trace panel makes it obvious where (the failing span is highlighted red with the exception message).

---

## Step 8.5 — Run the built-in workflow in DevUI

DevUI shows agents AND workflows side by side. The platform ships a built-in **`CampaignInsightsWorkflow`** that chains `MarketingAnalyticsAgent` into `CampaignOptimizationAgent` sequentially: the first agent gathers the metrics, and its output becomes the input to the second agent which then recommends concrete actions.

1. In DevUI's left sidebar, switch the entity dropdown to **`CampaignInsightsWorkflow`**.
2. The header now shows the workflow's executor graph (two boxes: analytics → optimization).
3. Type a prompt that benefits from both phases, e.g.
   > **"For the trailing 14 days, find any anomalies and propose 3 concrete optimizations."**
4. Send. DevUI renders the two agents executing in order:
   - `MarketingAnalyticsAgent` collects data via plugin tools (e.g. `get_open_rate`, `get_email_delivery`).
   - `CampaignOptimizationAgent` receives that analysis and returns a bulleted list of recommendations.
5. The **Traces** panel shows the full multi-agent span tree, with chat completions and tool calls under each agent.

> **Where the workflow lives.** This workflow is declared in code at AgentRuntime startup (see [`DevUiHostingExtensions.cs`](../src/Platform/MarketingAnalyticsAgentLab.AgentRuntime/DevUi/DevUiHostingExtensions.cs)) via `builder.AddWorkflow(name, factory)`. It's intentionally NOT editable from the Admin Portal — the platform principle is to align with DevUI rather than build a custom workflow designer. To add another workflow today, declare it in code alongside the existing one; to make workflows manageable from the Admin Portal in future, the natural extension is a `WorkflowDefinition` store in PluginRegistry parallel to `AgentDefinition`.

---

## Step 9 — Test the full Atlas-style flow from FakeAtlasApp

DevUI talks to the AgentRuntime directly. The real entry point for Atlas-style clients is the **AI Assistant Gateway**. This step exercises the entire production path.

1. In the Aspire dashboard, click the **fake-atlas** row. It opens the FakeAtlasApp in a new tab.
2. You'll see a clean chat surface with the *Marketing Analytics Assistant* badge. The header confirms `assistantId: marketing_analytics_assistant`, `tenantId: tenant-001`, `page: campaigns`.
3. Click one of the suggestion chips below the input — for example **"Find campaigns with low open rate"**.
4. The response renders with:
   - The agent's text answer.
   - A **Routed to** badge — e.g. `CampaignOptimizationAgent` — with a tooltip showing the router's reason.
   - A collapsible **Tool calls** list showing every `{ plugin, tool }` pair the agent invoked.
   - A small **traceId** for cross-referencing the Aspire dashboard.

The exact JSON request/response that flowed under the hood is documented in the [README](../README.md#the-single-endpoint).

---

## Step 10 — Inspect traces end-to-end

1. Go back to the **Aspire dashboard** tab.
2. Click **Traces** in the left sidebar.
3. Pick the most recent trace (the one with `AssistantInteraction` as its root span).

You should see a span tree like this:

```
AssistantInteraction               [Gateway]            ─┐
  AssistantRegistry.Resolve        [Gateway → Registry]  │
  AgentRouter.Resolve              [Gateway]             │  one trace,
  AgentRuntime.Execute             [Gateway → Runtime]   │  spanning every
    AIAgent.Run                    [Runtime]             │  hop end-to-end
      chat.completions             [Azure OpenAI]        │
      mcp.callTool get_open_rate   [Runtime → MCP]       │
        plugin.policy.evaluate     [MCP]                 │
        HTTP GET /analytics/...    [MCP → analytics-api] │
                                                        ─┘
```

Click any span to see the tags we attached (`assistant.id`, `agent.name`, `agent.router_reason`, `tool_calls.count`, `plugin.name`, etc.).

The same trace is **also visible inside DevUI** — open the agent run there and check the **Trace** tab. Both viewers consume the same OpenTelemetry source `MarketingAnalyticsAgentLab`.

---

## Step 11 — Test plugin hot-reload (advanced)

Without stopping anything:

1. Open the **MarketingAnalyticsPlugin** detail page.
2. Click **Unpublish**.
3. Without delay, send another message from FakeAtlasApp that would have used `get_open_rate`.

Expected behaviour:
- The Activity page shows a `plugin.unpublished` event.
- The MCP "Live tools" list drops to 4 (only `CampaignManagementPlugin` left).
- The agent's next reply explains it can't fetch open rate metrics and suggests trying again later.
- No restart of any service.

Re-publish and the tools come back instantly.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Agent in DevUI fails with *"Agent is not yet loaded by AgentLifecycleService"* | AgentRuntime crashed during prime (PluginRegistry not reachable or Azure OpenAI not configured). | Check the **agent-runtime** resource logs in the Aspire dashboard. Verify user-secrets are set on the AppHost. |
| Playground returns `502` or socket errors | Internal API not running yet. | Wait until every resource in the Aspire dashboard is **Running**. |
| FakeAtlasApp shows `409` with *"assistant is registered but not yet enabled"* | The Fleet stub was selected. | Make sure the assistantId is `marketing_analytics_assistant` (default). |
| FakeAtlasApp's response has empty `toolCalls[]` | Plugins not attached to the resolved agent, or plugins not published. | Re-check Steps 5–7. |
| DevUI shows agents but every chat returns *"I'm sorry, I can't help with that"* | Azure OpenAI deployment name doesn't match what's deployed in your Azure OpenAI resource. | `dotnet user-secrets --project src\Platform\MarketingAnalyticsAgentLab.AppHost set Parameters:AzureOpenAIDeployment "<your deployment>"` |
| New agent added in Admin Portal isn't visible in DevUI | The preview `Microsoft.Agents.AI.DevUI` package captures the agent set at AgentRuntime startup, even though the AgentRuntime itself picks up new agents dynamically. | Restart the AgentRuntime (Aspire dashboard → agent-runtime → **Stop** → **Start**). The startup code reads every agent definition from `data/agent-definitions/*.json`, so your new agent will appear in DevUI after the restart - no code change needed. |

---

## What you just exercised

| Layer | Touched |
| --- | --- |
| **OpenAPI Importer** | Fetched `/openapi/v1.json` from two standalone-app APIs |
| **PluginRegistry** | Created + configured + published two plugins |
| **Plugin Policies / Permissions** | Default always-allow evaluator (logged on every invocation) |
| **McpServer** | Hot-loaded the published plugins, exposed 8 MCP tools |
| **AgentRuntime** | Hot-rebuilt agents with attached plugin tools |
| **DevUI** | Workflow + trace + tool-call inspection |
| **AI Assistant Gateway** | Atlas-style entry point, assistant resolution + routing + aggregation |
| **FakeAtlasApp** | Atlas-style client demonstrating the integration contract |
| **OpenTelemetry** | End-to-end trace across all hops |

This is the full platform loop. Onboarding a new standalone application (e.g. Fleet) follows exactly the same steps — see [`docs/architecture.md` §11](architecture.md#11-reusing-the-platform-for-another-standalone-app).
