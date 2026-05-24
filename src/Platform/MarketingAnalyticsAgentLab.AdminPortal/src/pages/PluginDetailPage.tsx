import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, Check, Copy, Lock, Play, Save, Send, ShieldCheck, Sparkles, Wrench, X } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import {
  api,
  type AiPlaygroundResponse,
  type AiPlaygroundToolCall,
  type PlaygroundResponse,
  type PluginDefinition,
  type PluginEndpoint,
} from '../lib/platform';

type Tab = 'operations' | 'auth' | 'permissions' | 'playground';

// HTTP verbs that mutate upstream state. Surfaced as a "write" badge in the Operations
// tab and gated behind an explicit confirmation in the HTTP Playground; the AI Playground
// runs them unchanged because the LLM is already constrained by the agent's instructions.
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const isWriteMethod = (method: string) => WRITE_METHODS.has(method.toUpperCase());

export default function PluginDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const plugin = useQuery({ queryKey: ['plugin', id], queryFn: () => api.getPlugin(id) });
  const [tab, setTab] = useState<Tab>('operations');
  const [draft, setDraft] = useState<PluginDefinition | null>(null);
  useEffect(() => { if (plugin.data) setDraft(plugin.data); }, [plugin.data]);

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

  if (!draft) return <PageHeader title="Loading..." />;

  const writeCount = draft.endpoints.filter(e => isWriteMethod(e.method)).length;

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
              <span className="pill bg-amber-100 text-amber-800" title="At least one operation can mutate upstream state.">
                <AlertTriangle size={12} className="mr-1 inline" /> {writeCount} write {writeCount === 1 ? 'op' : 'ops'}
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
      <div className="px-8 pt-4">
        <div className="flex gap-1 border-b border-slate-200">
          {(['operations', 'auth', 'permissions', 'playground'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? 'border-brand-500 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="p-8">
        {tab === 'operations' && <OperationsTab draft={draft} setDraft={setDraft} />}
        {tab === 'auth' && <AuthTab draft={draft} setDraft={setDraft} />}
        {tab === 'permissions' && <PermissionsTab draft={draft} setDraft={setDraft} />}
        {tab === 'playground' && <PlaygroundTab plugin={draft} />}
      </div>
    </>
  );
}

function OperationsTab({ draft, setDraft }: { draft: PluginDefinition; setDraft: (p: PluginDefinition) => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-brand-100 bg-brand-50/50 px-4 py-3 text-xs text-brand-900">
        Each selected OpenAPI operation becomes one callable AI tool. The <strong>Tool name</strong> and{' '}
        <strong>Tool description</strong> are what the LLM sees when it picks a tool - keep them concrete and outcome-oriented.
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
              {write && draft.permissions.requiresApproval && (
                <span className="pill bg-violet-100 text-violet-800" title="Tool Set requires approval for invocations.">
                  <ShieldCheck size={12} className="mr-1 inline" /> requires approval
                </span>
              )}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Tool name
                <input className="input mt-1 font-mono" value={e.toolName}
                       onChange={x => updateEndpoint(draft, setDraft, idx, { toolName: x.target.value })} />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Tool description
                <input className="input mt-1" value={e.toolDescription}
                       onChange={x => updateEndpoint(draft, setDraft, idx, { toolDescription: x.target.value })} />
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

function updateEndpoint(draft: PluginDefinition, setDraft: (p: PluginDefinition) => void, idx: number, patch: Partial<PluginEndpoint>) {
  const next = [...draft.endpoints];
  next[idx] = { ...next[idx], ...patch };
  setDraft({ ...draft, endpoints: next });
}

function AuthTab({ draft, setDraft }: { draft: PluginDefinition; setDraft: (p: PluginDefinition) => void }) {
  return (
    <div className="card max-w-xl space-y-3 p-5">
      <label className="block text-xs font-medium text-slate-600">
        Type
        <select className="input mt-1" value={draft.auth.type} onChange={e => setDraft({ ...draft, auth: { ...draft.auth, type: e.target.value as any } })}>
          <option value="None">None</option>
          <option value="ApiKey">ApiKey</option>
          <option value="Bearer">Bearer</option>
          <option value="ClientCredentials">ClientCredentials</option>
        </select>
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Header name
        <input className="input mt-1" value={draft.auth.headerName ?? ''} onChange={e => setDraft({ ...draft, auth: { ...draft.auth, headerName: e.target.value } })} placeholder="X-Api-Key" />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Secret env-var name
        <input className="input mt-1" value={draft.auth.secretName ?? ''} onChange={e => setDraft({ ...draft, auth: { ...draft.auth, secretName: e.target.value } })} placeholder="ANALYTICS_API_KEY" />
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
        Permissions and policies attached to this Tool Set apply to every tool inside it.
        Read-only operations (GET) are safe to run unattended; write operations
        (POST/PUT/PATCH/DELETE) should require approval.
      </p>
      <label className="block text-xs font-medium text-slate-600">
        Allowed agents (comma-separated)
        <input className="input mt-1" value={draft.permissions.allowedAgents.join(', ')}
               onChange={e => setDraft({ ...draft, permissions: { ...draft.permissions, allowedAgents: csv(e.target.value) } })} />
      </label>
      <label className="block text-xs font-medium text-slate-600">
        Allowed tenants (comma-separated)
        <input className="input mt-1" value={draft.permissions.allowedTenants.join(', ')}
               onChange={e => setDraft({ ...draft, permissions: { ...draft.permissions, allowedTenants: csv(e.target.value) } })} />
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <input type="checkbox" checked={draft.permissions.requiresApproval} onChange={e => setDraft({ ...draft, permissions: { ...draft.permissions, requiresApproval: e.target.checked } })} />
        Requires approval before each invocation
      </label>
      {writeCount > 0 && !draft.permissions.requiresApproval && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle size={12} className="mr-1 inline" />
          This Tool Set has {writeCount} write {writeCount === 1 ? 'operation' : 'operations'}. Consider turning on
          <strong> Requires approval</strong> before publishing.
        </div>
      )}
    </div>
  );
}

function csv(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

type PlaygroundMode = 'http' | 'ai';

function PlaygroundTab({ plugin }: { plugin: PluginDefinition }) {
  const [mode, setMode] = useState<PlaygroundMode>('http');

  return (
    <div className="space-y-4">
      <ModeSwitch mode={mode} setMode={setMode} />
      {mode === 'http' ? <HttpPlayground plugin={plugin} /> : <AiPlayground plugin={plugin} />}
    </div>
  );
}

/**
 * HTTP vs AI playground mode selector. The HTTP path validates the wire shape (path,
 * params, auth); the AI path validates that the LLM can pick the right tool given the
 * configured ToolName + ToolDescription. Both are essential before publishing.
 */
function ModeSwitch({ mode, setMode }: { mode: PlaygroundMode; setMode: (m: PlaygroundMode) => void }) {
  const modes: Array<{ id: PlaygroundMode; label: string; hint: string; Icon: typeof Play }> = [
    { id: 'http', label: 'HTTP',  hint: 'Direct HTTP call - tests path, params, auth.',         Icon: Play },
    { id: 'ai',   label: 'AI',    hint: 'Natural-language - tests tool name + description.',     Icon: Bot  },
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

function HttpPlayground({ plugin }: { plugin: PluginDefinition }) {
  const [opId, setOpId] = useState(plugin.endpoints[0]?.operationId ?? '');
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PlaygroundResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [confirmWrite, setConfirmWrite] = useState(false);
  const op = plugin.endpoints.find(e => e.operationId === opId);
  const write = !!op && isWriteMethod(op.method);
  // For MVP, write operations only run after the operator ticks the explicit confirm box.
  // The button stays disabled otherwise so the LLM-side execution flow (which has its own
  // policy hooks) stays the primary path for mutations.
  const canRun = !!op && !running && (!write || confirmWrite);

  async function run() {
    if (!op) return;
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await api.runPlayground(plugin.id, { operationId: op.operationId, parameters: params });
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
          Issues the real HTTP request through the Tool Runtime against the imported API's
          base URL. Use this to verify wire-level shape: path, params, headers, and auth.
        </p>
        <label className="block text-xs font-medium text-slate-600">
          Operation
          <select className="input mt-1" value={opId} onChange={e => { setOpId(e.target.value); setConfirmWrite(false); }}>
            {plugin.endpoints.map(e => (
              <option key={e.operationId} value={e.operationId}>{e.method} {e.path}</option>
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
                This operation mutates upstream state. Confirm below before running.
              </span>
            )}
          </div>
        )}
        {op?.parameters.map(p => (
          <label key={p.name} className="mt-3 block text-xs font-medium text-slate-600">
            {p.name} <span className="text-slate-400">({p.in}, {p.type}{p.required ? ', required' : ''})</span>
            <input className="input mt-1" value={params[p.name] ?? ''} onChange={e => setParams({ ...params, [p.name]: e.target.value })} placeholder={p.description ?? ''} />
          </label>
        ))}
        {write && (
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={confirmWrite} onChange={e => setConfirmWrite(e.target.checked)} />
            I understand this {op?.method} request will hit the real upstream API.
          </label>
        )}
        <button className="btn mt-4" onClick={run} disabled={!canRun}>
          <Play size={14} /> {running ? 'Running...' : write ? `Run ${op?.method}` : 'Run'}
        </button>
      </div>
      <div className="card p-5">
        <div className="card-header -mx-5 -mt-5 mb-4 px-5">Response</div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {result && <ResponseViewer result={result} />}
        {!error && !result && (
          <p className="text-sm text-slate-500">Pick an operation, fill in parameters, and click <strong>Run</strong>.</p>
        )}
      </div>
    </div>
  );
}

/**
 * AI playground: type a natural-language prompt, the AgentRuntime spins up a one-shot LLM
 * agent with this plugin's tools, and we render the LLM reply alongside every tool call
 * (name, arguments, result, duration). The plugin does NOT need to be published.
 */
function AiPlayground({ plugin }: { plugin: PluginDefinition }) {
  const [message, setMessage] = useState(suggestedPrompt(plugin));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AiPlaygroundResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const m = message.trim();
    if (!m) return;
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await api.runAiPlayground(plugin.id, { message: m });
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
          The LLM sees only this Tool Set's tools. The Tool Set does <strong>not</strong> need to be published.
          Each tool is described to the LLM with the <strong>Tool name</strong> and <strong>Tool description</strong> you configured on the Operations tab.
        </p>
        <button className="btn mt-4" onClick={run} disabled={running || !message.trim()}>
          <Bot size={14} /> {running ? 'Asking the LLM...' : 'Run'}
        </button>
      </div>

      <div className="card p-5">
        <div className="card-header -mx-5 -mt-5 mb-4 px-5">Result</div>
        {error && <p className="text-sm text-rose-600 whitespace-pre-wrap">{error}</p>}
        {result?.error && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{result.error}</p>}
        {result && !result.error && (
          <>
            <div className="text-xs text-slate-500">Total {result.durationMs} ms · {result.toolCalls.length} tool call{result.toolCalls.length === 1 ? '' : 's'}</div>
            {result.reply && (
              <div className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
                {result.reply}
              </div>
            )}
            {result.toolCalls.length === 0 && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <strong>The LLM did not call any tool.</strong> This usually means the tool description is too vague, doesn't mention the kinds of questions it answers, or names a domain the LLM didn't infer from the prompt. Try editing the Tool description on the Operations tab.
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
            Type a question on the left and click <strong>Run</strong>. The LLM will decide whether to use one of this plugin's tools and we'll show you everything that happened.
          </p>
        )}
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
        <span className={`pill ${call.statusCode >= 200 && call.statusCode < 300 ? 'bg-emerald-100 text-emerald-800' : call.statusCode === 0 ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
          {call.statusCode === 0 ? 'error' : call.statusCode}
        </span>
        <span className="text-slate-500">{call.durationMs} ms</span>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Arguments</div>
          <pre className="mt-1 max-h-40 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] whitespace-pre-wrap break-all">{argsJson}</pre>
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

/**
 * Tries to suggest a sensible default prompt based on the plugin's first tool description.
 * Keeps the operator from staring at a blank textarea on first visit.
 */
function suggestedPrompt(plugin: PluginDefinition): string {
  const first = plugin.endpoints[0];
  if (!first) return '';
  // Strip "Get " / "List " etc. so the prompt feels like a human question, not a tool name.
  const verb = first.toolDescription?.toLowerCase().includes('open rate') ? 'Give me last 14 days open rate'
    : first.toolDescription?.toLowerCase().includes('delivery') ? 'What was the email delivery rate over the last 14 days?'
    : first.toolDescription?.toLowerCase().includes('campaign') ? 'List the most recent campaigns'
    : `Use ${first.toolName} to answer a typical question an operator would ask.`;
  return verb;
}

/**
 * Renders a Playground response with a Pretty/Raw toggle and a Copy button.
 *
 * Pretty mode parses the body as JSON (whether the API returned `application/json` or a
 * JSON-shaped `text/plain`) and re-serialises with 2-space indentation. We fall back to
 * the raw body silently on parse failure so the toggle never produces an empty pane.
 * Pretty is the default because every API in this platform returns JSON and a flat blob
 * is unreadable past ~200 chars.
 */
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
      // surfacing a stack to the operator - they can still select-and-copy manually.
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
