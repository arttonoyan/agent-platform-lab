import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  GitBranch,
  Info,
  LayoutTemplate,
  Play,
  Rocket,
  ShieldCheck,
  Workflow,
  Wrench,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Tabs, { type TabSpec } from '../components/Tabs';
import {
  api,
  platformUrls,
  type AssistantToolCallDto,
  type WorkflowDefinitionDto,
  type WorkflowRunResponse,
  type WorkflowStepResult,
} from '../lib/platform';

type WorkflowsTabId = 'built-in' | 'designer';
const VALID_TABS: WorkflowsTabId[] = ['built-in', 'designer'];

/**
 * Workflows page. One page, two tabs:
 *
 *   Built-in   - sequential agent chains baked into AgentRuntime (the
 *                CampaignInsightsWorkflow demo). Quick to run, great for showing
 *                "agents collaborating" in 60 seconds.
 *   Designer   - the embedded Elsa Studio iframe. Drag-and-drop authoring with
 *                branching, scheduling, approvals, and the InvokeTool activity that
 *                reaches every published Tool Set.
 *
 * Both tabs sit under one page because they're variations of the same concept (a
 * workflow); the split here is "pre-built and ready to run" vs "build your own".
 * The active tab is persisted in the URL (?tab=designer) so reloads land back on the
 * tab the operator was using.
 */
export default function WorkflowsPage() {
  const [params, setParams] = useSearchParams();

  const tabFromUrl = (params.get('tab') as WorkflowsTabId) ?? 'built-in';
  const tab: WorkflowsTabId = VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'built-in';

  function setTab(next: WorkflowsTabId) {
    setParams(prev => {
      const newParams = new URLSearchParams(prev);
      if (next === 'built-in') newParams.delete('tab');
      else newParams.set('tab', next);
      return newParams;
    });
  }

  const tabs: TabSpec<WorkflowsTabId>[] = [
    { id: 'built-in', label: 'Built-in', trailing: <Rocket size={12} className="text-slate-400" /> },
    { id: 'designer', label: 'Designer', trailing: <LayoutTemplate size={12} className="text-slate-400" /> },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Automations"
        subtitle="Event-driven and scheduled workflows. Build them in the Designer, expose them via HTTP / Timer / webhook triggers, or — if the workflow declares a prompt input and response output — let the runtime bridge it into the Agents catalog as a composite agent."
      />

      <div className="px-8 pt-6">
        <Tabs<WorkflowsTabId> tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {tab === 'built-in' && <BuiltInWorkflowsTab onSwitchToDesigner={() => setTab('designer')} />}
      {tab === 'designer' && <DesignerTab />}
    </div>
  );
}

// =====================================================================================
// Built-in tab: hardcoded sequential workflows from the AgentRuntime catalog
// =====================================================================================

function BuiltInWorkflowsTab({ onSwitchToDesigner }: { onSwitchToDesigner: () => void }) {
  const workflows = useQuery({
    queryKey: ['workflows'],
    queryFn: () => api.listWorkflows(),
  });

  return (
    <div className="space-y-6 p-8">
      <div className="rounded-lg border border-brand-100 bg-brand-50/40 px-4 py-3 text-sm text-brand-900">
        <p className="font-medium">Pre-built sequential workflows.</p>
        <p className="mt-1 text-brand-800/80">
          Each card below is a hardcoded agent chain registered on the AgentRuntime — quick to
          run end-to-end and great for demos. To author your own workflow with branching,
          scheduling, approvals, or any combination of agents and tools, switch to the{' '}
          <button
            type="button"
            onClick={onSwitchToDesigner}
            className="underline hover:text-brand-700"
          >
            Designer
          </button>
          {' '}tab.
        </p>
      </div>

      {workflows.isPending && <p className="text-sm text-slate-500">Loading workflows…</p>}
      {workflows.error instanceof Error && (
        <p className="text-sm text-rose-600">{workflows.error.message}</p>
      )}

      {workflows.data && workflows.data.length === 0 && (
        <div className="card flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-slate-500">
          <Workflow size={24} className="text-slate-400" />
          <p>No built-in workflows registered yet.</p>
          <p className="text-xs text-slate-400">
            Today these are defined in code on the AgentRuntime. A registry-backed store for
            workflow definitions is on the roadmap.
          </p>
        </div>
      )}

      {workflows.data?.map(w => (
        <WorkflowCard key={w.name} workflow={w} />
      ))}
    </div>
  );
}

// =====================================================================================
// Designer tab: embedded Elsa Studio iframe
// =====================================================================================

function DesignerTab() {
  const studioUrl = platformUrls.elsaStudio();

  return (
    <div className="flex flex-1 flex-col">
      {!studioUrl && (
        <div className="mx-8 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Info size={14} className="mr-1 inline" />
          Elsa Studio is not yet reachable. Wait for the <span className="font-mono">elsa-studio</span> container
          to start in the Aspire dashboard, then reload this page.
        </div>
      )}

      {studioUrl && (
        <div className="mx-8 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-100 bg-brand-50/50 px-3 py-2 text-xs text-brand-900">
          <span>
            <Workflow size={12} className="mr-1 inline" />
            Studio backend wired to <span className="font-mono">{platformUrls.agentRuntime()}/elsa/api</span>.
            Look for the <strong>Platform</strong> category in the activity palette — the
            <span className="ml-1 font-mono">Invoke Tool</span> activity calls any Published Tool Set tool.
          </span>
          <a href={studioUrl} target="_blank" rel="noreferrer" className="btn-ghost">
            <ExternalLink size={12} /> Open in new tab
          </a>
        </div>
      )}

      {studioUrl && (
        <div className="mx-8 mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>Demo login:</strong> first visit shows Elsa Studio's login screen. Sign in
          with <span className="font-mono">admin</span> / <span className="font-mono">password</span>;
          the cookie persists for the browser session. (Production deploys swap this for OIDC.)
        </div>
      )}

      <div className="flex-1 px-8 pb-8 pt-3">
        {studioUrl && (
          <iframe
            title="Elsa Studio"
            src={studioUrl}
            className="h-full w-full rounded-xl border border-slate-200 bg-white shadow-sm"
          />
        )}
      </div>
    </div>
  );
}

// =====================================================================================
// One workflow card: chain diagram + run UI + per-step result
// =====================================================================================

function WorkflowCard({ workflow }: { workflow: WorkflowDefinitionDto }) {
  const suggested = useMemo(() => suggestedPrompt(workflow), [workflow]);
  const [message, setMessage] = useState(suggested);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<WorkflowRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const m = message.trim();
    if (!m) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.runWorkflow(workflow.name, { message: m });
      setResult(res);
      if (res.error) setError(res.error);
    } catch (ex) {
      setError((ex as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <article className="card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700">
            <Workflow size={16} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900">{workflow.displayName}</h3>
              <span className="pill bg-slate-100 text-slate-600">Workflow</span>
              <span className="pill bg-emerald-50 text-emerald-700">
                {workflow.agentNames.length} {workflow.agentNames.length === 1 ? 'agent' : 'agents'}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">{workflow.description}</p>
            <div className="mt-1 font-mono text-xs text-slate-500">{workflow.name}</div>
          </div>
        </div>
      </header>

      <section className="border-b border-slate-100 px-5 py-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Agent chain
        </div>
        <AgentChain agentNames={workflow.agentNames} className="mt-2" />
      </section>

      <section className="grid gap-5 px-5 py-5 lg:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Prompt</div>
          <textarea
            className="input mt-1 resize-y"
            rows={3}
            value={message}
            onChange={e => setMessage(e.target.value)}
            disabled={running}
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              className="btn"
              onClick={run}
              disabled={running || !message.trim()}
            >
              <Play size={14} /> {running ? 'Running workflow…' : 'Run workflow'}
            </button>
            {result && (
              <span className="text-xs text-slate-500">
                <Clock size={12} className="mr-1 inline" /> {result.totalDurationMs} ms total
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            The runtime runs each agent in order. The first agent's response becomes the
            second agent's prompt. We show every step's output and tool calls on the right.
          </p>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Final answer
          </div>
          {error && (
            <p className="mt-1 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 whitespace-pre-wrap">
              {error}
            </p>
          )}
          {result && !result.error && (
            <div className="mt-1 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
              {result.finalResponse || (
                <span className="text-slate-400">(The last agent returned no text.)</span>
              )}
            </div>
          )}
          {!result && !error && (
            <p className="mt-1 text-sm text-slate-500">
              Pick a prompt and click <strong>Run workflow</strong> to see both agents collaborate.
            </p>
          )}
        </div>
      </section>

      {result && result.steps.length > 0 && (
        <section className="border-t border-slate-100 px-5 py-5">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <GitBranch size={12} /> Step-by-step
          </div>
          <div className="space-y-3">
            {result.steps.map((step, idx) => (
              <WorkflowStepCard key={idx} index={idx} step={step} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

// =====================================================================================
// Visual agent chain
// =====================================================================================

function AgentChain({ agentNames, className }: { agentNames: string[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      {agentNames.map((name, idx) => (
        <span key={name} className="contents">
          <span className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm">
            <Bot size={14} className="text-brand-700" />
            <span className="font-mono text-brand-900">{name}</span>
          </span>
          {idx < agentNames.length - 1 && <ArrowRight size={14} className="text-slate-400" />}
        </span>
      ))}
    </div>
  );
}

// =====================================================================================
// One workflow step
// =====================================================================================

function WorkflowStepCard({ index, step }: { index: number; step: WorkflowStepResult }) {
  const [showTools, setShowTools] = useState(step.toolCalls.length > 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {index + 1}
          </div>
          <span className="font-mono text-sm font-semibold text-slate-900">{step.agentName}</span>
          {step.toolCalls.length > 0 && (
            <span className="pill bg-emerald-50 text-emerald-700">
              <Wrench size={10} className="mr-1 inline" />
              {step.toolCalls.length} tool {step.toolCalls.length === 1 ? 'call' : 'calls'}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500">
          <Clock size={11} className="mr-1 inline" /> {step.durationMs} ms
        </span>
      </header>

      {/* Input/output side by side. The input is collapsed for the first step (it's
          just the operator's prompt and they can already see it above), but expanded
          for subsequent steps so it's clear the hand-off happened. */}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {index === 0 ? 'Input (your prompt)' : `Input (from step ${index})`}
          </div>
          <pre className="mt-1 max-h-40 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] whitespace-pre-wrap break-words">
            {step.input || '(empty)'}
          </pre>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Response</div>
          <pre className="mt-1 max-h-40 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] whitespace-pre-wrap break-words">
            {step.response || '(no text response)'}
          </pre>
        </div>
      </div>

      {step.toolCalls.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowTools(s => !s)}
            className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900"
          >
            {showTools ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Tool calls ({step.toolCalls.length})
          </button>
          {showTools && (
            <ul className="mt-2 space-y-2">
              {step.toolCalls.map((tc, i) => (
                <li key={i}>
                  <ToolCallRow call={tc} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ToolCallRow({ call }: { call: AssistantToolCallDto }) {
  const statusTone =
    call.status === 'denied'
      ? 'bg-violet-100 text-violet-800'
      : call.status === 'failed'
      ? 'bg-rose-100 text-rose-800'
      : 'bg-emerald-100 text-emerald-800';
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-mono font-medium text-slate-800">
          <Wrench size={12} /> {call.tool}
        </span>
        <span className={`pill ${statusTone}`}>
          {call.status === 'denied' && <ShieldCheck size={10} className="mr-1 inline" />}
          {call.status}
        </span>
        {call.sourceMethod && call.sourcePath && (
          <span className="text-slate-500">
            <span className="font-mono">{call.sourceMethod}</span>{' '}
            <span className="font-mono">{call.sourcePath}</span>
          </span>
        )}
        <span className="text-slate-500">
          via <span className="font-mono">{call.plugin}</span>
        </span>
        {typeof call.durationMs === 'number' && (
          <span className="ml-auto text-slate-500">{call.durationMs} ms</span>
        )}
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Arguments</div>
          <pre className="mt-1 max-h-32 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px] whitespace-pre-wrap break-all">
            {prettyJson(call.argumentsJson)}
          </pre>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Result</div>
          <pre className="mt-1 max-h-32 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px] whitespace-pre-wrap break-all">
            {call.resultPreview ?? '(empty)'}
          </pre>
        </div>
      </div>
    </div>
  );
}

// =====================================================================================
// Helpers
// =====================================================================================

function prettyJson(text?: string | null): string {
  if (!text) return '(empty)';
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function suggestedPrompt(workflow: WorkflowDefinitionDto): string {
  // Tailored hint for the built-in CampaignInsightsWorkflow. Falls back to a generic
  // multi-agent prompt for any workflow we haven't met before so the textarea is never
  // empty on first visit.
  if (workflow.name === 'CampaignInsightsWorkflow') {
    return 'For the trailing 14 days, find any anomalies and propose 3 concrete optimizations.';
  }
  return 'Run this workflow with a question that requires both agents.';
}
