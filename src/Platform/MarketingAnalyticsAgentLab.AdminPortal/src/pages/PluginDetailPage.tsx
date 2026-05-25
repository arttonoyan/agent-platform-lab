import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronRight,
  Copy,
  Lock,
  Play,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import Tabs, { type TabSpec } from '../components/Tabs';
import {
  api,
  type AgentDefinition,
  type AiPlaygroundResponse,
  type AiPlaygroundToolCall,
  type PlaygroundResponse,
  type PluginDefinition,
  type PluginEndpoint,
} from '../lib/platform';
import { classifyService } from '../lib/catalog';

type Tab = 'tools' | 'auth' | 'permissions' | 'playground' | 'publish';
const TAB_IDS: Tab[] = ['tools', 'auth', 'permissions', 'playground', 'publish'];

// HTTP verbs that mutate upstream state. Surfaced as a "write" badge in the Tools
// tab and gated behind an explicit confirmation in the Tool Playground; the LLM
// playground runs them unchanged because the LLM is already constrained by the
// agent's instructions.
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const isWriteMethod = (method: string) => WRITE_METHODS.has(method.toUpperCase());

/**
 * Tool Set detail page. The Tool Set is the unit of governance: it owns tool names,
 * descriptions, auth, permissions, and publish lifecycle.
 *
 * Tabs:
 *   Tools        - one entry per OpenAPI operation → one callable AI tool.
 *   Auth         - auth config applied to every tool in the set.
 *   Permissions  - allowed agents/tenants + approval policy.
 *   Playground   - Tool Playground (HTTP + optional simulated/real LLM modes).
 *   Publish      - lifecycle: Draft → Testing → Published / Disabled.
 *
 * NOTE on attachment: a Tool Set surfaces "used by N agents" here, but never an
 * "Attach to Agent" CTA. Agents own attachment; Tools owns lifecycle.
 */
export default function PluginDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();

  const toolSet = useQuery({ queryKey: ['plugin', id], queryFn: () => api.getPlugin(id) });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.listAgents() });
  const specs = useQuery({ queryKey: ['apis'], queryFn: () => api.listApiSpecs() });

  const tabFromUrl = (params.get('tab') as Tab) ?? 'tools';
  const tab: Tab = TAB_IDS.includes(tabFromUrl) ? tabFromUrl : 'tools';
  function setTab(next: Tab) {
    setParams(prev => {
      const newParams = new URLSearchParams(prev);
      if (next === 'tools') newParams.delete('tab');
      else newParams.set('tab', next);
      return newParams;
    });
  }

  const [draft, setDraft] = useState<PluginDefinition | null>(null);
  useEffect(() => { if (toolSet.data) setDraft(toolSet.data); }, [toolSet.data]);

  const save = useMutation({
    mutationFn: () => {
      if (!draft) throw new Error('No draft.');
      return api.updatePlugin(draft.id, {
        name: draft.name,
        displayName: draft.displayName,
        description: draft.description,
        endpoints: draft.endpoints,
        auth: draft.auth,
        permissions: draft.permissions,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plugin', id] }),
  });
  const publish = useMutation({
    mutationFn: () => api.publishPlugin(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plugin', id] }),
  });
  const unpublish = useMutation({
    mutationFn: () => api.unpublishPlugin(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plugin', id] }),
  });

  if (!draft) return <PageHeader title="Loading…" />;

  const writeCount = draft.endpoints.filter(e => isWriteMethod(e.method)).length;
  const spec = specs.data?.find(s => s.id === draft.apiSpecId);
  const sourceMeta = spec ? classifyService(spec.serviceName) : null;
  const usingAgents = (agents.data ?? []).filter(a => a.pluginIds.includes(draft.id));

  const tabs: TabSpec<Tab>[] = [
    { id: 'tools',       label: 'Tools', count: draft.endpoints.length },
    { id: 'auth',        label: 'Auth' },
    { id: 'permissions', label: 'Permissions' },
    { id: 'playground',  label: 'Playground' },
    { id: 'publish',     label: 'Publish' },
  ];

  return (
    <>
      <PageHeader
        title={draft.displayName}
        subtitle={draft.description}
        actions={
          <div className="flex items-center gap-2">
            <span className="pill bg-slate-100 text-slate-700">Tool Set</span>
            <StatusPill status={draft.status} />
            {writeCount > 0 && (
              <span className="pill bg-amber-100 text-amber-800" title="At least one tool can mutate upstream state.">
                <AlertTriangle size={12} className="mr-1 inline" /> {writeCount} write {writeCount === 1 ? 'tool' : 'tools'}
              </span>
            )}
            {draft.permissions.requiresApproval && (
              <span className="pill bg-violet-100 text-violet-800" title="Operator approval required before invocation.">
                <ShieldCheck size={12} className="mr-1 inline" /> Approval required
              </span>
            )}
            {draft.status === 'Published' ? (
              <button className="btn-ghost" onClick={() => unpublish.mutate()} disabled={unpublish.isPending}>
                <X size={14} /> Unpublish
              </button>
            ) : (
              <button className="btn" onClick={() => publish.mutate()} disabled={publish.isPending}>
                <Send size={14} /> Publish
              </button>
            )}
            <button className="btn-ghost" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save size={14} /> Save
            </button>
          </div>
        }
      />
      <div className="px-8 pt-3">
        <Breadcrumbs name={draft.displayName} />
        <UsageStrip toolSet={draft} usingAgents={usingAgents} spec={spec ?? null} sourceMeta={sourceMeta} />
        <Tabs<Tab> tabs={tabs} active={tab} onChange={setTab} className="mt-4" />
      </div>
      <div className="p-8">
        {tab === 'tools' && <ToolsTab draft={draft} setDraft={setDraft} />}
        {tab === 'auth' && <AuthTab draft={draft} setDraft={setDraft} />}
        {tab === 'permissions' && <PermissionsTab draft={draft} setDraft={setDraft} />}
        {tab === 'playground' && <ToolPlaygroundTab toolSet={draft} />}
        {tab === 'publish' && (
          <PublishTab
            toolSet={draft}
            usingAgents={usingAgents}
            onPublish={() => publish.mutate()}
            onUnpublish={() => unpublish.mutate()}
            publishing={publish.isPending}
            unpublishing={unpublish.isPending}
          />
        )}
      </div>
    </>
  );
}

function Breadcrumbs({ name }: { name: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500" aria-label="Breadcrumb">
      <Link to="/tools" className="hover:text-slate-700">Tools</Link>
      <ChevronRight size={12} className="text-slate-300" />
      <Link to="/tools?tab=tool-sets" className="hover:text-slate-700">Tool Sets</Link>
      <ChevronRight size={12} className="text-slate-300" />
      <span className="text-slate-700">{name}</span>
    </nav>
  );
}

/**
 * Compact usage strip beneath the breadcrumbs. Surfaces the "is anyone using this?"
 * question every operator asks before publishing or unpublishing. Per the IA rule we
 * never expose an "Attach to Agent" button here — the operator clicks through to the
 * Agents page to manage attachment.
 */
function UsageStrip({
  toolSet,
  usingAgents,
  spec,
  sourceMeta,
}: {
  toolSet: PluginDefinition;
  usingAgents: AgentDefinition[];
  spec: { id: string; displayName: string } | null;
  sourceMeta: ReturnType<typeof classifyService> | null;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
      <span>
        <span className="font-semibold text-slate-700">Tools:</span> {toolSet.endpoints.length}
      </span>
      <span>
        <span className="font-semibold text-slate-700">Source API:</span>{' '}
        {spec ? (
          <Link to={`/tools/sources/${spec.id}`} className="text-brand-700 hover:text-brand-900">
            {spec.displayName}
          </Link>
        ) : (
          <span className="text-slate-400">(unknown)</span>
        )}
      </span>
      {sourceMeta && (
        <span>
          <span className="font-semibold text-slate-700">Owner:</span> {sourceMeta.ownerTeam}
        </span>
      )}
      <span>
        <span className="font-semibold text-slate-700">Used by:</span>{' '}
        {usingAgents.length === 0 ? (
          <span className="text-slate-400">no agents</span>
        ) : (
          <>
            <span>
              <Bot size={11} className="mr-1 inline text-slate-400" />
              {usingAgents.length} {usingAgents.length === 1 ? 'agent' : 'agents'} (
              {usingAgents.map(a => a.displayName).join(', ')})
            </span>
            <Link to="/agents" className="ml-2 text-brand-700 hover:text-brand-900">
              Manage in Agents →
            </Link>
          </>
        )}
      </span>
    </div>
  );
}

// =====================================================================================
// Tools tab
// =====================================================================================

function ToolsTab({ draft, setDraft }: { draft: PluginDefinition; setDraft: (p: PluginDefinition) => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-brand-100 bg-brand-50/50 px-4 py-3 text-xs text-brand-900">
        Each selected OpenAPI operation becomes one callable AI tool. The <strong>Tool name</strong> and{' '}
        <strong>Tool description</strong> are what the LLM sees when it picks a tool — keep them concrete
        and outcome-oriented. Tool names must be unique within a Tool Set.
      </div>
      {draft.endpoints.map((e, idx) => {
        const write = isWriteMethod(e.method);
        return (
          <div key={e.operationId} className="card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`pill font-mono ${write ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{e.method}</span>
              <span className="font-mono text-sm text-slate-700">{e.path}</span>
              <span className={`pill ${write ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                {write ? 'write' : 'read-only'}
              </span>
              {write && (
                <span
                  className="pill bg-violet-100 text-violet-800"
                  title="Write tools require approval before invocation; disabled for MVP execution."
                >
                  <ShieldCheck size={12} className="mr-1 inline" /> Requires approval
                </span>
              )}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Tool name
                <input
                  className="input mt-1 font-mono"
                  value={e.toolName}
                  onChange={x => updateEndpoint(draft, setDraft, idx, { toolName: x.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Tool description
                <input
                  className="input mt-1"
                  value={e.toolDescription}
                  onChange={x => updateEndpoint(draft, setDraft, idx, { toolDescription: x.target.value })}
                />
              </label>
            </div>
            {e.parameters.length > 0 && (
              <table className="mt-3 w-full text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1 text-left">Parameter</th>
                    <th>In</th>
                    <th>Type</th>
                    <th>Required</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {e.parameters.map(p => (
                    <tr key={p.name + p.in} className="border-t border-slate-100">
                      <td className="py-1 font-mono">{p.name}</td>
                      <td className="text-center">{p.in}</td>
                      <td className="text-center">{p.type}</td>
                      <td className="text-center">{p.required ? 'yes' : 'no'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

function updateEndpoint(
  draft: PluginDefinition,
  setDraft: (p: PluginDefinition) => void,
  idx: number,
  patch: Partial<PluginEndpoint>,
) {
  const next = [...draft.endpoints];
  next[idx] = { ...next[idx], ...patch };
  setDraft({ ...draft, endpoints: next });
}

function AuthTab({ draft, setDraft }: { draft: PluginDefinition; setDraft: (p: PluginDefinition) => void }) {
  return (
    <div className="card max-w-xl space-y-3 p-5">
      <label className="block text-xs font-medium text-slate-600">
        Type
        <select
          className="input mt-1"
          value={draft.auth.type}
          onChange={e => setDraft({ ...draft, auth: { ...draft.auth, type: e.target.value as any } })}
        >
          <option value="None">None</option>
          <option value="ApiKey">ApiKey</option>
          <option value="Bearer">Bearer</option>
          <option value="ClientCredentials">ClientCredentials</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Header name
        <input
          className="input mt-1"
          value={draft.auth.headerName ?? ''}
          onChange={e => setDraft({ ...draft, auth: { ...draft.auth, headerName: e.target.value } })}
          placeholder="X-Api-Key"
        />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Secret env-var name
        <input
          className="input mt-1"
          value={draft.auth.secretName ?? ''}
          onChange={e => setDraft({ ...draft, auth: { ...draft.auth, secretName: e.target.value } })}
          placeholder="ANALYTICS_API_KEY"
        />
      </label>
      <p className="text-xs text-slate-500">For the demo, secrets are read from process env vars on the McpServer host.</p>
    </div>
  );
}

function PermissionsTab({ draft, setDraft }: { draft: PluginDefinition; setDraft: (p: PluginDefinition) => void }) {
  const writeCount = draft.endpoints.filter(e => isWriteMethod(e.method)).length;
  return (
    <div className="card max-w-xl space-y-3 p-5">
      <p className="text-xs text-slate-500">
        Permissions and policies attached to this Tool Set apply to every tool inside it. Read-only
        operations (GET) are safe to run unattended; write operations (POST/PUT/PATCH/DELETE)
        should require approval and are disabled for execution in the MVP.
      </p>
      <label className="block text-xs font-medium text-slate-600">
        Allowed agents (comma-separated)
        <input
          className="input mt-1"
          value={draft.permissions.allowedAgents.join(', ')}
          onChange={e => setDraft({ ...draft, permissions: { ...draft.permissions, allowedAgents: csv(e.target.value) } })}
        />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Allowed tenants (comma-separated)
        <input
          className="input mt-1"
          value={draft.permissions.allowedTenants.join(', ')}
          onChange={e => setDraft({ ...draft, permissions: { ...draft.permissions, allowedTenants: csv(e.target.value) } })}
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <input
          type="checkbox"
          checked={draft.permissions.requiresApproval}
          onChange={e => setDraft({ ...draft, permissions: { ...draft.permissions, requiresApproval: e.target.checked } })}
        />
        Requires approval before each invocation
      </label>
      {writeCount > 0 && !draft.permissions.requiresApproval && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle size={12} className="mr-1 inline" />
          This Tool Set has {writeCount} write {writeCount === 1 ? 'tool' : 'tools'}. Consider turning on
          <strong> Requires approval</strong> before publishing.
        </div>
      )}
    </div>
  );
}

function csv(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

// =====================================================================================
// Tool Playground tab
// =====================================================================================

type PlaygroundMode = 'http' | 'ai-simulated' | 'ai-real';

/**
 * Tool Playground: lives at the Tool Set level. Three modes (per the IA spec):
 *
 *   1. HTTP            - direct call through Tool Runtime, NO model involved. Mostly
 *                        used to verify the tool can execute end-to-end.
 *   2. AI (simulated)  - lightweight tool-selection test that does not consume model
 *                        budget; useful for sanity-checking tool names + descriptions
 *                        without involving the real LLM (today defaults to the same
 *                        backend path; flagged "simulated" so the operator can switch
 *                        once a simulator is wired in).
 *   3. AI (real model) - one-shot LLM call against this Tool Set's tools using the
 *                        model deployment displayed. Validates name + description guide
 *                        the LLM correctly. The model deployment, mode, selected tool,
 *                        generated input, and execution result are all visible.
 */
function ToolPlaygroundTab({ toolSet }: { toolSet: PluginDefinition }) {
  const [mode, setMode] = useState<PlaygroundMode>('http');

  return (
    <div className="space-y-4">
      <ModeSwitch mode={mode} setMode={setMode} />
      {mode === 'http' && <HttpPlayground toolSet={toolSet} />}
      {(mode === 'ai-simulated' || mode === 'ai-real') && (
        <AiPlayground toolSet={toolSet} simulated={mode === 'ai-simulated'} />
      )}
    </div>
  );
}

function ModeSwitch({ mode, setMode }: { mode: PlaygroundMode; setMode: (m: PlaygroundMode) => void }) {
  const modes: Array<{ id: PlaygroundMode; label: string; hint: string; Icon: typeof Play }> = [
    { id: 'http',         label: 'HTTP',           hint: 'Direct HTTP call - no model involved.',                      Icon: Play },
    { id: 'ai-simulated', label: 'AI (simulated)', hint: 'Tool-selection sanity check; no model budget consumed.',     Icon: Sparkles },
    { id: 'ai-real',      label: 'AI (real model)',hint: 'Real LLM call against this Tool Set.',                       Icon: Bot },
  ];
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        {modes.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              mode === id ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      <span className="text-xs text-slate-500">{modes.find(m => m.id === mode)?.hint}</span>
    </div>
  );
}

function HttpPlayground({ toolSet }: { toolSet: PluginDefinition }) {
  const [opId, setOpId] = useState(toolSet.endpoints[0]?.operationId ?? '');
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PlaygroundResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [confirmWrite, setConfirmWrite] = useState(false);
  const op = toolSet.endpoints.find(e => e.operationId === opId);
  const write = !!op && isWriteMethod(op.method);
  // Write executions require the operator to tick the explicit confirm box first. The
  // LLM-side execution path (which has its own policy hooks) stays the primary route
  // for mutations.
  const canRun = !!op && !running && (!write || confirmWrite);

  async function run() {
    if (!op) return;
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await api.runPlayground(toolSet.id, { operationId: op.operationId, parameters: params });
      setResult(res);
    } catch (ex) {
      setError((ex as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card p-5">
        <div className="card-header -mx-5 -mt-5 mb-4 px-5">Invoke</div>
        <p className="mb-3 text-xs text-slate-500">
          Issues the real HTTP request through the Tool Runtime against the imported source's
          base URL. Use this to verify wire-level shape: path, params, headers, and auth.
          <strong> No model is involved.</strong>
        </p>
        <label className="block text-xs font-medium text-slate-600">
          Tool
          <select className="input mt-1" value={opId} onChange={e => { setOpId(e.target.value); setConfirmWrite(false); }}>
            {toolSet.endpoints.map(e => (
              <option key={e.operationId} value={e.operationId}>
                {e.toolName} — {e.method} {e.path}
              </option>
            ))}
          </select>
        </label>
        {op && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className={`pill ${write ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
              {write ? 'write' : 'read-only'}
            </span>
            {write && (
              <span className="text-amber-700">
                <Lock size={12} className="mr-1 inline" />
                This tool mutates upstream state. Confirm below before running.
              </span>
            )}
          </div>
        )}
        {op?.parameters.map(p => (
          <label key={p.name} className="mt-3 block text-xs font-medium text-slate-600">
            {p.name} <span className="text-slate-400">({p.in}, {p.type}{p.required ? ', required' : ''})</span>
            <input
              className="input mt-1"
              value={params[p.name] ?? ''}
              onChange={e => setParams({ ...params, [p.name]: e.target.value })}
              placeholder={p.description ?? ''}
            />
          </label>
        ))}
        {write && (
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={confirmWrite} onChange={e => setConfirmWrite(e.target.checked)} />
            I understand this {op?.method} request will hit the real upstream API.
          </label>
        )}
        <button className="btn mt-4" onClick={run} disabled={!canRun}>
          <Play size={14} /> {running ? 'Running…' : write ? `Run ${op?.method}` : 'Run'}
        </button>
      </div>
      <div className="card p-5">
        <div className="card-header -mx-5 -mt-5 mb-4 px-5">Response</div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {result && <ResponseViewer result={result} />}
        {!error && !result && (
          <p className="text-sm text-slate-500">Pick a tool, fill in parameters, and click <strong>Run</strong>.</p>
        )}
      </div>
    </div>
  );
}

function AiPlayground({ toolSet, simulated }: { toolSet: PluginDefinition; simulated: boolean }) {
  const [message, setMessage] = useState(suggestedPrompt(toolSet));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AiPlaygroundResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Until the backend has a true tool-selection simulator the simulated mode shares
  // the same /ai-playground endpoint; we surface the mode + the deployment name in the
  // header so the operator knows which budget they are spending.
  const modeLabel = simulated ? 'simulated' : 'real model';
  const modelDeployment = '(agent runtime default)';

  async function run() {
    const m = message.trim();
    if (!m) return;
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await api.runAiPlayground(toolSet.id, { message: m });
      setResult(res);
    } catch (ex) {
      setError((ex as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-brand-100 bg-brand-50/50 px-4 py-3 text-xs text-brand-900">
        <div className="flex flex-wrap items-center gap-3">
          <span><strong>Mode:</strong> {modeLabel}</span>
          <span><strong>Model deployment:</strong> <span className="font-mono">{modelDeployment}</span></span>
          <span><strong>Tool Set:</strong> <span className="font-mono">{toolSet.displayName}</span></span>
        </div>
        <p className="mt-1 text-[11px] text-brand-800/80">
          The LLM sees only this Tool Set's tools, with the configured tool name and description as
          the selection hint. We display every tool the model picked, the arguments it generated,
          and the execution result.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <div className="card-header -mx-5 -mt-5 mb-4 px-5">Ask the LLM</div>
          <label className="block text-xs font-medium text-slate-600">
            Prompt
            <textarea
              className="input mt-1 resize-y"
              rows={4}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="e.g. give me last 14 days open rate"
              disabled={running}
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">
            The Tool Set does <strong>not</strong> need to be published to test it here.
          </p>
          <button className="btn mt-4" onClick={run} disabled={running || !message.trim()}>
            <Bot size={14} /> {running ? 'Asking the LLM…' : 'Run'}
          </button>
        </div>

        <div className="card p-5">
          <div className="card-header -mx-5 -mt-5 mb-4 px-5">Result</div>
          {error && <p className="text-sm text-rose-600 whitespace-pre-wrap">{error}</p>}
          {result?.error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{result.error}</p>}
          {result && !result.error && (
            <>
              <div className="text-xs text-slate-500">
                Total {result.durationMs} ms · {result.toolCalls.length} tool call{result.toolCalls.length === 1 ? '' : 's'}
              </div>
              {result.reply && (
                <div className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
                  {result.reply}
                </div>
              )}
              {result.toolCalls.length === 0 && (
                <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <strong>The LLM did not call any tool.</strong> This usually means the tool description is too
                  vague, doesn't mention the kinds of questions it answers, or names a domain the LLM didn't infer
                  from the prompt. Try editing the Tool description on the Tools tab.
                </p>
              )}
              <div className="mt-3 space-y-2">
                {result.toolCalls.map((tc, idx) => (
                  <ToolCallCard key={idx} call={tc} />
                ))}
              </div>
            </>
          )}
          {!result && !error && (
            <p className="text-sm text-slate-500">
              Type a question on the left and click <strong>Run</strong>. The LLM decides whether to use one of this
              Tool Set's tools and we'll show you everything that happened.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolCallCard({ call }: { call: AiPlaygroundToolCall }) {
  const argsJson = useMemo(() => safeStringify(call.arguments), [call.arguments]);
  const resultJson = useMemo(() => safeStringify(call.result), [call.result]);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-mono font-medium text-slate-800">
          <Wrench size={12} /> {call.toolName}
        </span>
        <span
          className={`pill ${
            call.statusCode >= 200 && call.statusCode < 300
              ? 'bg-emerald-100 text-emerald-800'
              : call.statusCode === 0
              ? 'bg-rose-100 text-rose-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {call.statusCode === 0 ? 'error' : call.statusCode}
        </span>
        <span className="text-slate-500">{call.durationMs} ms</span>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Arguments</div>
          <pre className="mt-1 max-h-40 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] whitespace-pre-wrap break-all">
            {argsJson}
          </pre>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Result</div>
          <pre className="mt-1 max-h-40 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] whitespace-pre-wrap break-all">
            {call.error ?? resultJson}
          </pre>
        </div>
      </div>
    </div>
  );
}

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); }
  catch { return String(value); }
}

function suggestedPrompt(toolSet: PluginDefinition): string {
  const first = toolSet.endpoints[0];
  if (!first) return '';
  const desc = first.toolDescription?.toLowerCase() ?? '';
  if (desc.includes('open rate')) return 'Give me last 14 days open rate';
  if (desc.includes('delivery')) return 'What was the email delivery rate over the last 14 days?';
  if (desc.includes('campaign')) return 'List the most recent campaigns';
  return `Use ${first.toolName} to answer a typical question an operator would ask.`;
}

function ResponseViewer({ result }: { result: PlaygroundResponse }) {
  const [pretty, setPretty] = useState(true);
  const [copied, setCopied] = useState(false);

  const looksLikeJson = useMemo(() => {
    const trimmed = result.body.trimStart();
    return trimmed.startsWith('{') || trimmed.startsWith('[');
  }, [result.body]);

  const formatted = useMemo(() => {
    if (!pretty || !looksLikeJson) return result.body;
    try { return JSON.stringify(JSON.parse(result.body), null, 2); }
    catch { return result.body; }
  }, [pretty, looksLikeJson, result.body]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write can fail in non-secure contexts; fail silently rather than
      // surfacing a stack to the operator — they can still select-and-copy manually.
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-500">
          Status <span className="font-mono">{result.statusCode}</span> · {result.durationMs} ms · {result.contentType}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPretty(p => !p)}
            disabled={!looksLikeJson}
            title={looksLikeJson ? (pretty ? 'Show raw body' : 'Pretty-print JSON') : 'Body is not JSON'}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${
              pretty && looksLikeJson
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Sparkles size={12} /> {pretty ? 'Formatted' : 'Raw'}
          </button>
          <button
            type="button"
            onClick={copy}
            title="Copy response to clipboard"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre">
        {formatted}
      </pre>
    </>
  );
}

// =====================================================================================
// Publish tab
// =====================================================================================

function PublishTab({
  toolSet,
  usingAgents,
  onPublish,
  onUnpublish,
  publishing,
  unpublishing,
}: {
  toolSet: PluginDefinition;
  usingAgents: AgentDefinition[];
  onPublish: () => void;
  onUnpublish: () => void;
  publishing: boolean;
  unpublishing: boolean;
}) {
  const writeCount = toolSet.endpoints.filter(e => isWriteMethod(e.method)).length;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card p-5">
        <div className="card-header -mx-5 -mt-5 mb-4 px-5">Lifecycle</div>
        <div className="space-y-3 text-sm text-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Status</span>
            <StatusPill status={toolSet.status} />
            <span className="text-xs text-slate-500">
              · last updated {new Date(toolSet.updatedAt).toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Publishing happens at the Tool Set level so every tool inside ships and rolls back together.
            Once published, the McpServer hot-loads the tools and agents that attach this Tool Set can
            start calling them within seconds.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {toolSet.status === 'Published' ? (
              <button className="btn-ghost" onClick={onUnpublish} disabled={unpublishing}>
                <X size={14} /> Unpublish
              </button>
            ) : (
              <button className="btn" onClick={onPublish} disabled={publishing}>
                <Send size={14} /> Publish
              </button>
            )}
            {usingAgents.length > 0 && (
              <span className="text-xs text-amber-700">
                <AlertTriangle size={12} className="mr-1 inline" />
                {usingAgents.length} {usingAgents.length === 1 ? 'agent uses' : 'agents use'} this Tool Set
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="card p-5 text-sm text-slate-600">
        <div className="card-header -mx-5 -mt-5 mb-4 px-5">Publish checklist</div>
        <ul className="space-y-2 text-xs">
          <CheckItem label="Every tool has a concrete name and outcome-oriented description" />
          <CheckItem label="Tool descriptions mention the kinds of questions they answer" />
          <CheckItem label="Allowed agents listed under Permissions" />
          <CheckItem label="Approval policy reviewed" warn={writeCount > 0} />
          <CheckItem label="HTTP playground returned 200 for read-only tools" />
          <CheckItem label="AI playground picks the right tool from a realistic prompt" />
        </ul>
      </div>
    </div>
  );
}

function CheckItem({ label, warn }: { label: string; warn?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={`mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border ${
          warn ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-300 bg-white text-slate-400'
        }`}
        aria-hidden
      >
        {warn ? <AlertTriangle size={10} /> : <Wrench size={10} />}
      </span>
      <span className="text-slate-700">{label}</span>
    </li>
  );
}
