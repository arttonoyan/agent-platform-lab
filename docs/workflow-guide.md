# Building a real workflow with agents, conditions, publish, and test

This guide walks you through building a complete production-shaped workflow in Elsa
Studio, end to end:

- HTTP trigger
- Two agent calls chained with an expression
- A branching condition (`If`)
- Publishing it
- Testing via cURL / Postman / Studio's built-in HTTP runner

The scenario we'll build: **Campaign Health Triage**. A caller POSTs a campaign id,
the *Marketing Analytics Agent* assesses it, and if the campaign looks at-risk the
*Campaign Optimization Agent* proposes fixes. The final recommendation is returned
to the caller as JSON.

```
POST /campaign-triage  →  Marketing Analytics Agent  →  if AT_RISK  →  Campaign Optimization Agent  →  HTTP Response
                                                                  └─  else  ────────────────────────→  HTTP Response
```

---

## 0. Prerequisites

- AppHost is running (from Visual Studio or `dotnet run --project src/Platform/MarketingAnalyticsAgentLab.AppHost`).
- You can open the Admin Portal → **Workflows → Designer** and log in to Elsa Studio
  with `admin` / `password`.
- Under the **Activities** panel you can see the **Agents** category with at least
  *Marketing Analytics Agent* and *Campaign Optimization Agent*. (If the category is
  empty, hit `POST /agents/reload` on agent-runtime to refresh.)

> Whenever you're not sure about the underlying APIs, the Aspire dashboard
> (`https://localhost:17100`) and the AgentRuntime resource's console logs show every
> request hitting `/elsa/api/*` plus the activity-registry refresh messages.

---

## 1. Create the workflow definition

1. Studio → **Workflows → Definitions → + Create**.
2. Name: `Campaign Health Triage`. Description: *Analyze a campaign and propose
   optimizations if the analysis flags risk.*
3. Click **Create**. You land on an empty canvas with a single auto-added
   `Flowchart` root container.

---

## 2. Add the HTTP trigger

The trigger is what starts the workflow when something happens outside it.

1. In the **Activities** panel (left), expand **HTTP**.
2. Drag **HTTP Endpoint** onto the canvas. Rename its Id (top of the Properties
   panel) to `httpTrigger` for readability.
3. In the **INPUT** tab:
   - **Path**: `/campaign-triage`
   - **Supported methods**: tick `POST`
   - **Can start workflow**: ✅ on (this is what makes it a workflow trigger,
     not an inline HTTP call).
   - **Read content**: ✅ on (we need access to the JSON body).
4. The trigger now has a green outline marker meaning *workflow start*.

The HTTP Endpoint activity exposes a `Request` output you can read in downstream
expressions like `httpTrigger.Request.Body.campaignId`.

---

## 3. Declare two workflow variables

Variables let us pass data cleanly between activities and keep expressions short.

1. Click the **Variables** tab on the right rail → **+ Add variable**.
2. Create:
   - Name `campaignId`, Type **`String`** (top of the Primitives section — scroll up
     if you only see Json/Data types).
   - Name `analysis`, Type **`String`**.
   - Name `recommendations`, Type **`String`**.
3. Save (Auto-save is on by default).

---

## 4. Capture the request payload

Drag the activities below into the flowchart **in order**, connecting each one's
`Done` output port to the next activity's input.

### 4a. Set Variable — extract campaignId

1. Drag **Set Variable** from the **Primitives** category.
2. **INPUT** tab:
   - **Variable**: pick `campaignId` from the dropdown.
   - **Value**: switch the input mode (⋮ menu on the right of the field) to
     **JavaScript** and enter:

     ```js
     getInput("httpTrigger").Request.Body.campaignId
     ```

     *Liquid alternative:* `{{ httpTrigger.Request.Body.campaignId }}`

This pins the campaign id into a variable so every later activity (and any
condition) can reference it without re-parsing the request body.

---

## 5. Call the first agent — Marketing Analytics

1. Drag **Marketing Analytics Agent** from the **Agents** category. Rename its id
   to `analyzeAgent`.
2. **INPUT** tab → **Prompt** → switch to **JavaScript**:

   ```js
   "Analyze campaign " + getVariable("campaignId") + ". " +
   "Reply with the first word being exactly HEALTHY or AT_RISK, " +
   "followed by a 2-sentence justification. Do not add anything else before the verdict."
   ```

   We're forcing a structured first token so the condition we add next can branch
   on it deterministically. This is the simplest "structured output" pattern;
   ask for JSON if you want richer fields.

3. **OUTPUT** tab → **Result** → pick **Variable** mode → set to `analysis`.

The agent's response text is now in the `analysis` variable.

---

## 6. Add the condition — If activity

1. Drag **If** from the **Branching** category. Connect `analyzeAgent.Done` → `if`.
2. **INPUT** → **Condition** → mode **JavaScript**:

   ```js
   getVariable("analysis").trim().toUpperCase().startsWith("AT_RISK")
   ```

   *Liquid alternative:* `{{ Variables.analysis | upcase | starts_with: "AT_RISK" }}`

3. The `If` activity now exposes two output ports: **True** and **False**. We'll
   wire them to two separate downstream activities.

---

## 7. True branch — call the optimization agent

1. Drag **Campaign Optimization Agent** from **Agents**. Rename id to `optimizeAgent`.
2. Connect the `If` activity's **True** port to `optimizeAgent`.
3. **Prompt** → **JavaScript**:

   ```js
   "Campaign " + getVariable("campaignId") + " was assessed as AT RISK. " +
   "The analyst said:\n\n" + getVariable("analysis") + "\n\n" +
   "Propose 3 concrete, measurable optimizations. " +
   "Format as a numbered list with one KPI per item."
   ```

4. **OUTPUT** → **Result** → Variable → `recommendations`.

---

## 8. False branch — pass through

If the analyst said HEALTHY, we don't need a second agent. Just stamp a
default value into `recommendations` so the response shape stays consistent.

1. Drag **Set Variable** from **Primitives**.
2. Connect `If`'s **False** port to this Set Variable.
3. **Variable**: `recommendations`. **Value** (mode **JavaScript**):

   ```js
   "Campaign is healthy. No interventions recommended."
   ```

---

## 9. Merge and respond

Both branches end in the same `HTTP Response` activity.

1. Drag **HTTP Response** from the **HTTP** category. Rename id to `httpResponse`.
2. Connect *both* the `optimizeAgent.Done` output and the false-branch
   `Set Variable.Done` output to `httpResponse`. The flowchart container handles
   the merge automatically — Elsa runs `httpResponse` whichever branch arrives
   first.
3. **INPUT** tab:
   - **Status code**: `200`
   - **Content type**: `application/json`
   - **Content** → mode **JavaScript**:

     ```js
     JSON.stringify({
       campaignId:      getVariable("campaignId"),
       verdict:         getVariable("analysis"),
       recommendations: getVariable("recommendations")
     })
     ```

That's the entire workflow. The canvas should look like:

```
httpTrigger ─→ Set Variable (campaignId) ─→ analyzeAgent ─→ If ──True──→ optimizeAgent ──┐
                                                            └─False─→ Set Variable ──────┤
                                                                                          ↓
                                                                                    httpResponse
```

---

## 10. Publish

Saving keeps the draft. **Publishing** is what makes the trigger live.

1. Top-right toolbar → **Publish** (cloud icon).
2. Confirm. The version number ticks to `v1` and the workflow status becomes
   **Published**.

You can confirm the trigger registered by looking at AgentRuntime's console logs —
you should see something like:

```
info: Elsa.Workflows.Runtime.TriggerIndexer[0] Indexed 1 trigger(s) for workflow 'Campaign Health Triage'.
```

---

## 11. Test it

You have three options, pick whichever is convenient.

### Option A — cURL

The HTTP trigger is mounted on agent-runtime under the `/triggers` base path
(set in `ElsaHostingExtensions.ElsaHttpBasePath` — we override Elsa's default
of `/workflows` to avoid colliding with the platform's own `/workflows` minimal
API). So if you typed `/campaign-triage` into the HTTP Endpoint's `Path` field,
the trigger lives at `/triggers/campaign-triage`.

Find the agent-runtime URL in the Aspire dashboard (it's the one serving
`/elsa/api`), then:

```bash
curl -k -X POST https://localhost:<agent-runtime-port>/triggers/campaign-triage \
  -H "Content-Type: application/json" \
  -d '{"campaignId":"SPRING-2026-FLASH-SALE"}'
```

Expected response:

```json
{
  "campaignId": "SPRING-2026-FLASH-SALE",
  "verdict": "AT_RISK Open rate is below 12 % and click-through is trending down 4 weeks in a row.",
  "recommendations": "1. Re-segment list... \n2. ..."
}
```

(The actual text depends on what the agent has access to via its tool sets.)

### Option B — Postman / Insomnia / Bruno / etc.

Same request as above. If the dev cert isn't trusted, disable cert verification
in the client. The agent-runtime port changes each run; you can also point at
the AdminPortal-injected service URL.

### Option C — Aspire dashboard

The Aspire dashboard's structured logs show every request, plus the workflow
instance id. Click the request log → "Trace" tab → you get the full distributed
trace including agent token usage and any tool calls.

---

## 12. Inspect the run in Studio

1. Studio → **Workflows → Instances**.
2. Find your latest instance — it'll show status `Finished` and a timestamp.
3. Click it. The **Designer** view re-renders the flowchart with each activity
   color-coded by status. You'll see which branch the `If` activity took.
4. Click any activity → **Journal** panel on the right has the inputs, outputs,
   and the custom telemetry the agent activity records:

   ```
   agentName:        marketing-analytics-agent
   model:            gpt-4o-mini
   inputTokens:      842
   outputTokens:     156
   latencyMs:        2317
   toolCallCount:    2
   toolCalls:        [{ tool: "get_open_rate", plugin: "MarketingAnalyticsToolSet", durationMs: 412 }, ...]
   ```

This is the same telemetry the REST `/agents/{name}/run` endpoint records, so
agent runs from workflows and from the Playground show up consistently.

---

## 13. Iterate without losing the trigger

Once published, you can keep editing as a **Draft** (the *Edit* / pencil icon).
The published version keeps serving traffic until you re-publish. Use
**Versions** in the top toolbar to view history and rollback.

If you change a per-agent activity (e.g. the agent's name changes in YAML),
`ActivityRegistryRefreshOnAgentChange` republishes descriptors automatically.
Existing workflows keep working as long as the TypeName (`Agents.<name>`)
remains stable; if you rename an agent in the YAML you'll have to re-drag the
new descriptor into the workflow.

---

## 14. Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `If` always takes the false branch | Agent didn't follow the "first word" instruction | Tighten the prompt; or use a JS expression with regex/contains instead of `startsWith` |
| Expression dropdown only shows Default/Variable/Input | `Elsa.Expressions.JavaScript` / `Elsa.Expressions.Liquid` not registered on backend | Already wired in `ElsaHostingExtensions.UseJavaScript()` + `UseLiquid()` — confirm the backend rebuilt after the package add |
| HTTP trigger 404 | Workflow not published, path mismatch, or missing `/triggers` prefix | Check **Definitions** list shows *Published*; confirm path is `/campaign-triage`; the caller URL must include the `/triggers` prefix → `POST /triggers/campaign-triage` |
| Agent activity throws *not registered* | Agent name in `Agents.<name>` was renamed in YAML | Re-drag the new agent from the palette; remove the stale activity |
| Long agent response truncated in journal | UI truncates only — full text is in the variable | The Variable holds the full text; downstream uses unaffected |
| Token cost surprise | Each `Run Agent` is one full LLM call (with possible tool calls) | Watch `inputTokens` / `outputTokens` in the journal; bake summarization into prompts for chained agents |

---

## 15. Publishing a workflow as a Composite Agent

If your workflow follows a **prompt → answer** shape (one string in, one string
out), you can expose it under the same `/agents/{name}/run` surface that simple
YAML agents use. It will appear in the Admin Portal's **Agents** page with a
**Composite** badge, in the AI Assistant Gateway, and in Atlas — anywhere the
platform lists agents — with **no extra wiring or HTTP plumbing**.

The contract is a workflow-level **input** named `prompt` (type `String`) and a
workflow-level **output** named `response` (type `String`).

### Build a composite agent in 5 steps

1. Create or open a workflow in **Automations → Designer**.
2. Open the workflow's **Inputs** panel (top toolbar). Add:
   - Name: `prompt`, Type: `String`. Mark as required if you want.
3. Open the workflow's **Outputs** panel. Add:
   - Name: `response`, Type: `String`.
4. Inside the flowchart, treat `prompt` as your starting data and write to
   `response` at the end. A minimal example:

   ```
   [Run Agent: Marketing Analytics Agent]
       Prompt (JS): getInput("prompt")
       Result → variable "analysis"
                 │
                 ▼
   [Set Workflow Output]
       Output: response
       Value (JS): getVariable("analysis")
   ```

   You don't need an HTTP Endpoint trigger for this — the bridge invokes the
   workflow directly via Elsa's workflow runner. (You can still add one if you
   also want a raw REST endpoint; the two surfaces coexist.)
5. **Publish**. Within ~10 seconds the workflow appears as a composite agent at:

   ```
   POST /agents/<workflow-name>/run
   { "message": "your prompt here" }
   ```

   …and the Admin Portal's **Agents** page shows a *Composite* card with an
   "Open in Designer" link back to the workflow.

### What this gives you

- **Same caller contract**: Atlas, the Playground, the AI Assistant Gateway, and
  external systems hit `POST /agents/<name>/run` regardless of whether the agent
  is a single YAML LLM call or a 12-step orchestration. No client-side branching
  on agent type.
- **Aggregate token usage**: composite agents report the sum of all internal LLM
  calls' tokens, so the Playground's cost-per-run UI works identically.
- **Live refresh**: a 10-second background poll keeps the catalog in sync with
  Elsa publishes/un-publishes. No agent-runtime restart needed.
- **Boundary stays clean**: workflows that *don't* declare the `prompt`/`response`
  shape stay in the Automations section and are reachable via their own
  triggers (HTTP, Timer, etc.). Composite agents and event-driven automations
  share the designer but live in different consumption surfaces.

### When NOT to expose a workflow as an agent

- The workflow is event-driven (webhook handlers, scheduled scans, background
  ETL). Those belong in Automations and are triggered by their non-HTTP
  triggers — no prompt/response contract makes sense.
- The workflow returns structured JSON, not a string. Keep it as an HTTP
  endpoint where the body shape is honest about what's coming back.
- The workflow needs streaming output. Composite agents currently return the
  final string at completion — they don't stream token-by-token like simple
  agents do (see Phase 3 in the unification design).

## 16. Where to go next

- **Parallel branches**: use `Fork` / `Join` from Branching to run two agents
  simultaneously and merge their results.
- **Loops**: `For Each` over a list of campaign ids (parse from request body
  with `JSON.parse`).
- **Long-running approvals**: drop a `User Task` between two agents so a human
  reviews the analysis before the optimization step runs.
- **Scheduled runs**: replace the HTTP trigger with `Timer` to run nightly.
- **Tool-set composition**: combine `Run Agent` with the existing
  `Invoke Tool` activity for fine-grained mixed-mode workflows (call a tool
  directly when you don't need an LLM in the loop).
