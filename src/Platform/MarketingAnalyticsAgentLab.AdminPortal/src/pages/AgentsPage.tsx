import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, ExternalLink, FlaskConical, Loader2, Play, Plus, RefreshCcw, Save, Send, Workflow, Wrench } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { api, platformUrls, type AgentDefinition, type AgentPlaygroundResponse, type LiveAgent } from '../lib/platform';

const blank: AgentDefinition = {
  id: '',
  name: '',
  displayName: '',
  description: '',
  instructions: '',
  modelDeployment: 'gpt-4o-mini',
  pluginIds: [],
  routingHints: [],
};

export default function AgentsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.listAgents() });
  const plugins = useQuery({ queryKey: ['plugins', 'all'], queryFn: () => api.listPlugins() });
  const live = useQuery({ queryKey: ['live-agents'], queryFn: () => api.listLiveAgents(), refetchInterval: 5_000 });
  const [editing, setEditing] = useState<AgentDefinition | null>(null);
  // PlayingWith holds the LiveAgent the operator is currently testing. Using LiveAgent
  // (not AgentDefinition) so both standard and workflow agents can be tested through
  // the same UI — workflow agents have no AgentDefinition counterpart.
  const [playingWith, setPlayingWith] = useState<LiveAgent | null>(null);
  // Three-state authoring flow: null (idle) → "picker" (choose kind) → "standard"
  // (existing AgentDefinition form) or "workflow" (scaffold-creation form). Wrapped
  // in one state value so the modal mounts/unmounts cleanly.
  const [creating, setCreating] = useState<'picker' | 'workflow' | null>(null);

  const save = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('Nothing to save');
      return api.saveAgent({
        id: editing.id || undefined,
        name: editing.name,
        displayName: editing.displayName,
        description: editing.description,
        instructions: editing.instructions,
        modelDeployment: editing.modelDeployment,
        pluginIds: editing.pluginIds,
        routingHints: editing.routingHints,
      });
    },
    onSuccess: saved => {
      setEditing(saved);
      qc.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const reload = useMutation({ mutationFn: () => api.reloadAgents() });
  const devUiUrl = platformUrls.devUi();

  return (
    <>
      <PageHeader
        title="Agents"
        subtitle="Agents attach published Tool Sets and tools; they don't create them. Use this page for name, instructions, model, attached Tool Sets, and routing hints."
        actions={
          <div className="flex gap-2">
            {devUiUrl && (
              <a className="btn-ghost" href={devUiUrl} target="_blank" rel="noreferrer">
                <FlaskConical size={14} /> Open DevUI
                <ExternalLink size={12} className="text-slate-400" />
              </a>
            )}
            <button className="btn-ghost" onClick={() => reload.mutate()} disabled={reload.isPending}>
              <RefreshCcw size={14} /> Reload AgentRuntime
            </button>
            <button className="btn" onClick={() => setCreating('picker')}>
              <Plus size={14} /> New agent
            </button>
          </div>
        }
      />

      <div className="space-y-4 p-8">
        <div className="rounded-lg border border-brand-100 bg-brand-50/40 px-4 py-3 text-sm text-brand-900">
          <p className="font-medium">Admin Portal manages metadata - DevUI runs the agents.</p>
          <p className="mt-1 text-brand-800/80">
            Use this page to configure name, instructions, model, attached <strong>Tool Sets</strong>, and routing hints.
            Agents only <em>use</em> published Tool Sets / tools — to create new tools go to <strong>Tools</strong>.
            Need a multi-step agent that orchestrates several agents and conditional flow?
            Build it in <Link to="/automations" className="ml-0 underline">Automations</Link> as a workflow with a
            <code className="mx-1 rounded bg-white/60 px-1 font-mono text-[11px]">prompt</code> input and a
            <code className="mx-1 rounded bg-white/60 px-1 font-mono text-[11px]">response</code> output — it'll show
            up here automatically as a <span className="font-medium">Workflow</span> agent and is callable through the
            same <code className="font-mono text-[11px]">/agents/&lt;name&gt;/run</code> API.
          </p>
        </div>

        {/* Unified agents grid. Iterated from `live` (the agent-runtime's /agents
            endpoint) which returns BOTH kinds — simple AIAgents loaded from YAML AND
            composite agents bridged from published Elsa workflows. For simple agents we
            additionally join with `agents.data` (PluginRegistry's AgentDefinition) to
            pull edit-time metadata like model, attached tool sets, routing hints. The
            card body adapts per kind so each surface shows only what's meaningful. */}
        <div className="grid gap-4 lg:grid-cols-2">
          {(live.data ?? []).map(l => {
            const isComposite = l.kind === 'Composite';
            const definition = agents.data?.find(a => a.name === l.name);
            return (
              <div key={l.name} className="card flex flex-col">
                <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
                  <div className="flex items-start gap-3">
                    {isComposite ? (
                      <Workflow size={18} className="mt-0.5 text-indigo-600" />
                    ) : (
                      <Bot size={18} className="mt-0.5 text-brand-600" />
                    )}
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{l.displayName}</div>
                      <div className="font-mono text-xs text-slate-500">{l.name}</div>
                    </div>
                  </div>
                  <span
                    className={`pill ${isComposite ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'}`}
                    title={isComposite ? 'Backed by a published Elsa workflow — same /agents/<name>/run contract' : `Live AIAgent with ${l.tools.length} tools`}
                  >
                    {isComposite ? 'workflow' : 'standard'}
                  </span>
                </div>
                <div className="flex-1 space-y-2 px-5 py-3 text-xs text-slate-600">
                  <div>{l.description || <span className="text-slate-400">(no description)</span>}</div>
                  {isComposite ? (
                    <div className="text-slate-500">
                      Authored as an Elsa workflow. Same <code className="font-mono text-[11px]">/agents/{`<name>`}/run</code> contract as standard agents — Atlas, Gateway, and the Playground call it identically.
                    </div>
                  ) : (
                    <>
                      {definition && (
                        <>
                          <div>
                            <span className="font-semibold text-slate-700">Model:</span>{' '}
                            <span className="font-mono">{definition.modelDeployment}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-700">Attached Tool Sets:</span>{' '}
                            {definition.pluginIds.length === 0
                              ? <span className="text-slate-400">(none attached)</span>
                              : <span>{definition.pluginIds.length}</span>}
                          </div>
                          <div>
                            <span className="font-semibold text-slate-700">Routing hints:</span>{' '}
                            {definition.routingHints && definition.routingHints.length > 0
                              ? definition.routingHints.map(h => <span key={h} className="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{h}</span>)
                              : <span className="text-slate-400">none</span>}
                          </div>
                        </>
                      )}
                      <div>
                        <span className="font-semibold text-slate-700">Live tools:</span>{' '}
                        {l.tools.length === 0 ? <span className="text-slate-400">(none)</span> : <span className="font-mono">{l.tools.length}</span>}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-2">
                  {isComposite ? (
                    <Link to="/automations?tab=designer" className="btn-ghost">
                      Open in Designer
                    </Link>
                  ) : definition ? (
                    <button className="btn-ghost" onClick={() => setEditing(definition)}>
                      Edit metadata
                    </button>
                  ) : null}
                  <button className="btn-ghost" onClick={() => setPlayingWith(l)}>
                    <Play size={14} /> Test
                  </button>
                </div>
              </div>
            );
          })}

          {(live.data ?? []).length === 0 && (
            <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
              No agents are registered with the runtime yet. Define one with <strong>New agent</strong> above,
              or build a multi-step agent in <Link to="/automations" className="underline">Automations</Link> with a
              <code className="mx-1 rounded bg-white px-1 font-mono text-[11px]">prompt</code> input and a
              <code className="mx-1 rounded bg-white px-1 font-mono text-[11px]">response</code> output —
              published workflows show up here automatically.
            </div>
          )}
        </div>

        {/* Pending-edit cards: any YAML AgentDefinition that the runtime hasn't loaded
            yet (e.g. first boot, plugin registry just changed) won't appear in `live`
            until the next refresh — show them in a small section so the operator knows
            the metadata is saved but the runtime hasn't hot-loaded it. */}
        {agents.data && agents.data.some(a => !live.data?.find(l => l.name === a.name)) && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Bot size={12} /> Pending runtime load
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                YAML metadata saved, runtime hasn't picked it up yet
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {agents.data.filter(a => !live.data?.find(l => l.name === a.name)).map(a => (
                <div key={a.id} className="card flex flex-col opacity-75">
                  <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
                    <div className="flex items-start gap-3">
                      <Bot size={18} className="mt-0.5 text-slate-400" />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{a.displayName}</div>
                        <div className="font-mono text-xs text-slate-500">{a.name}</div>
                      </div>
                    </div>
                    <span className="pill bg-slate-100 text-slate-600" title="Definition saved but AgentRuntime hasn't loaded it yet">
                      pending
                    </span>
                  </div>
                  <div className="flex-1 px-5 py-3 text-xs text-slate-600">
                    <div>{a.description}</div>
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-2">
                    <button className="btn-ghost" onClick={() => setEditing(a)}>
                      Edit metadata
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-6">
          <div className="card max-h-[90vh] w-full max-w-3xl overflow-auto">
            <div className="card-header flex items-center justify-between">
              <span>{editing.id ? `Edit ${editing.displayName}` : 'New agent'}</span>
              <button className="text-slate-400 hover:text-slate-700" onClick={() => setEditing(null)}>✕</button>
            </div>
            <div className="space-y-3 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">
                  Name (no spaces)
                  <input className="input mt-1 font-mono" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="MarketingAnalyticsAgent" />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Display name
                  <input className="input mt-1" value={editing.displayName} onChange={e => setEditing({ ...editing, displayName: e.target.value })} />
                </label>
                <label className="col-span-2 block text-xs font-medium text-slate-600">
                  Description
                  <input className="input mt-1" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Model deployment
                  <input className="input mt-1 font-mono" value={editing.modelDeployment} onChange={e => setEditing({ ...editing, modelDeployment: e.target.value })} />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Routing hints (comma separated)
                  <input className="input mt-1" value={(editing.routingHints ?? []).join(', ')} onChange={e => setEditing({ ...editing, routingHints: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} />
                </label>
              </div>
              <label className="block text-xs font-medium text-slate-600">
                Instructions
                <textarea className="input mt-1 font-mono" rows={6} value={editing.instructions} onChange={e => setEditing({ ...editing, instructions: e.target.value })} />
              </label>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Attached Tool Sets</div>
                <p className="mt-1 text-xs text-slate-500">
                  Pick from Tool Sets created on the <strong>Tools</strong> page. Only published Tool Sets are exposed at runtime.
                </p>
                <div className="mt-2 grid gap-1 md:grid-cols-2">
                  {plugins.data?.map(p => {
                    const checked = editing.pluginIds.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked ? editing.pluginIds.filter(x => x !== p.id) : [...editing.pluginIds, p.id];
                            setEditing({ ...editing, pluginIds: next });
                          }}
                        />
                        <div>
                          <div className="font-medium text-slate-900">{p.displayName}</div>
                          <div className="text-xs text-slate-500">{p.status} · {p.endpoints.length} {p.endpoints.length === 1 ? 'tool' : 'tools'}</div>
                        </div>
                      </label>
                    );
                  })}
                  {plugins.data?.length === 0 && (
                    <p className="text-xs text-slate-500">
                      No Tool Sets exist yet. Open <strong>Tools</strong> and create one from selected endpoints first.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn" onClick={() => save.mutate(undefined, { onSuccess: () => setEditing(null) })} disabled={save.isPending}>
                <Save size={14} /> Save metadata
              </button>
            </div>
          </div>
        </div>
      )}

      {creating === 'picker' && (
        <AgentKindPicker
          onClose={() => setCreating(null)}
          onPickStandard={() => {
            setCreating(null);
            setEditing({ ...blank });
          }}
          onPickWorkflow={() => setCreating('workflow')}
        />
      )}

      {creating === 'workflow' && (
        <CreateWorkflowAgentModal
          onClose={() => setCreating(null)}
          onCreated={result => {
            setCreating(null);
            // Refresh both lists so the new composite shows up immediately on return
            // from Studio. Also navigate to the designer so the operator can drop in
            // activities; the bridge will promote the scaffold within ~10s and the
            // resulting card will be on the Agents page when they navigate back.
            qc.invalidateQueries({ queryKey: ['live-agents'] });
            navigate(`/automations?tab=designer&workflow=${encodeURIComponent(result.definitionId)}`);
          }}
        />
      )}

      {playingWith && (
        <AgentPlaygroundModal agent={playingWith} onClose={() => setPlayingWith(null)} />
      )}
    </>
  );
}

/**
 * Step 1 of the unified "+ New agent" flow: pick what kind of agent to author. The
 * two choices map to the two implementation strategies the platform supports —
 * Standard is a single-LLM YAML agent (existing edit-form flow), Workflow is a
 * multi-step Elsa-authored agent (jumps to the scaffold-creation modal then on to
 * the Studio designer for the actual activities).
 */
function AgentKindPicker({ onClose, onPickStandard, onPickWorkflow }: {
  onClose: () => void;
  onPickStandard: () => void;
  onPickWorkflow: () => void;
}) {
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-6">
      <div className="card w-full max-w-2xl">
        <div className="card-header flex items-center justify-between">
          <span>What kind of agent?</span>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2">
          <button
            onClick={onPickStandard}
            className="group rounded-lg border border-slate-200 bg-white p-5 text-left transition hover:border-emerald-400 hover:shadow-sm"
          >
            <div className="flex items-center gap-2 text-emerald-600">
              <Bot size={18} />
              <span className="text-sm font-semibold text-slate-900">Standard agent</span>
              <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">simple</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              One LLM call with attached <strong>Tool Sets</strong>. You configure name,
              system instructions, model, and which Tool Sets the agent can call. Best for
              focused agents like "summarize a campaign" or "answer a question using these tools."
            </p>
            <p className="mt-3 text-[10px] text-slate-400">Authored here, in a form. Saved as YAML.</p>
          </button>

          <button
            onClick={onPickWorkflow}
            className="group rounded-lg border border-slate-200 bg-white p-5 text-left transition hover:border-indigo-400 hover:shadow-sm"
          >
            <div className="flex items-center gap-2 text-indigo-600">
              <Workflow size={18} />
              <span className="text-sm font-semibold text-slate-900">Workflow agent</span>
              <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-800">workflow</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              A multi-step <strong>Elsa workflow</strong> that orchestrates one or more
              agents (and any other activity — conditions, loops, parallel branches). Best for
              "analyze, then if at-risk, recommend fixes" or anything that needs branching.
              <br/>
              Atlas and the Gateway call it the same way — same <code className="font-mono text-[10px]">/agents/&lt;name&gt;/run</code> URL.
            </p>
            <p className="mt-3 text-[10px] text-slate-400">Scaffold created here. Authored in Elsa Studio.</p>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Step 2 of the workflow-agent path: collect name/description and POST to the
 * scaffold endpoint. The backend creates+publishes an empty workflow with the
 * prompt/response shape the bridge expects; on success we jump the operator to
 * the Automations designer focused on the new workflow so they can drop in the
 * actual activities. No more 8-step manual setup.
 */
function CreateWorkflowAgentModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (result: { definitionId: string; name: string; displayName: string }) => void;
}) {
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api.createWorkflowAgent({
        name: name.trim(),
        displayName: displayName.trim() || null,
        description: description.trim() || null,
      }),
    onSuccess: result => onCreated({ definitionId: result.definitionId, name: result.name, displayName: result.displayName }),
  });

  const nameValid = name.trim().length >= 2;
  const error = create.error ? (create.error as Error).message : null;

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-6">
      <div className="card w-full max-w-xl">
        <div className="card-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Workflow size={16} className="text-indigo-600" />
            <span>New workflow agent</span>
          </div>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        <div className="space-y-3 p-5">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-xs text-indigo-900">
            Creates a fresh Elsa workflow with <code className="rounded bg-white/60 px-1 font-mono text-[10px]">prompt</code> input
            and <code className="rounded bg-white/60 px-1 font-mono text-[10px]">response</code> output already wired, and publishes it.
            You'll land in the Studio designer to add the actual activities — when you publish there,
            this agent goes live on the Agents page automatically.
          </div>

          <label className="block text-xs font-medium text-slate-600">
            Name (no spaces, used in the API URL)
            <input
              autoFocus
              className="input mt-1 font-mono"
              value={name}
              onChange={e => setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_'))}
              placeholder="HelloAgent"
            />
            <span className="mt-1 block text-[10px] text-slate-400">
              Available at <code className="font-mono">/agents/{name.trim() || '<name>'}/run</code>
            </span>
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Display name (optional — what humans see)
            <input
              className="input mt-1"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Hello Agent"
            />
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Description (optional)
            <textarea
              className="input mt-1"
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What this agent does, who should use it..."
            />
          </label>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button className="btn-ghost" onClick={onClose} disabled={create.isPending}>Cancel</button>
          <button
            className="btn"
            onClick={() => create.mutate()}
            disabled={!nameValid || create.isPending}
          >
            {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create & open in designer
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * One-shot chat surface for any agent surfaced by the runtime. Posts a single message
 * to POST /agents/{name}/run and renders the reply plus tool-call telemetry.
 *
 * Works identically for simple and composite agents because the runtime endpoint
 * already dispatches based on agent kind — the modal doesn't need to know which.
 */
function AgentPlaygroundModal({ agent, onClose }: { agent: LiveAgent; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<Array<{ id: string; prompt: string; response?: AgentPlaygroundResponse; error?: string }>>([]);

  // Each modal instance gets one conversation id. Re-opening the modal restarts the
  // conversation — that's the intended dev/test ergonomic; rapid trial-and-error
  // shouldn't carry stale context between separate test sessions.
  const [conversationId] = useState(() => crypto.randomUUID());

  const run = useMutation({
    mutationFn: (prompt: string) =>
      api.runAgent(agent.name, {
        message: prompt,
        conversationId,
        tenantId: 'tenant-playground',
      }),
  });

  function submit() {
    const prompt = message.trim();
    if (!prompt || run.isPending) return;
    setMessage('');
    const turnId = crypto.randomUUID();
    setHistory(h => [...h, { id: turnId, prompt }]);
    run.mutate(prompt, {
      onSuccess: response =>
        setHistory(h => h.map(t => (t.id === turnId ? { ...t, response } : t))),
      onError: err =>
        setHistory(h => h.map(t => (t.id === turnId ? { ...t, error: (err as Error).message } : t))),
    });
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-6">
      <div className="card flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="card-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            {agent.kind === 'Composite' ? (
              <Workflow size={16} className="text-indigo-600" />
            ) : (
              <Bot size={16} className="text-brand-600" />
            )}
            <span>Playground · {agent.displayName}</span>
            <span className={`pill ${agent.kind === 'Composite' ? 'bg-indigo-100 text-indigo-800' : 'bg-brand-100 text-brand-800'}`}>
              {agent.kind === 'Composite' ? 'workflow' : 'standard'}
            </span>
            <span className="font-mono text-xs text-slate-500">{agent.name}</span>
          </div>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-5">
          {history.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              <FlaskConical size={20} className="mx-auto text-slate-400" />
              <p className="mt-2">
                Send a message to test this agent. {agent.kind === 'Composite'
                  ? 'The underlying workflow runs end-to-end and its response output is returned.'
                  : 'The agent runs with its attached Tool Sets; tool calls show below.'}
              </p>
            </div>
          )}

          {history.map(turn => (
            <div key={turn.id} className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-xl rounded-2xl bg-brand-600 px-4 py-2 text-sm text-white">
                  {turn.prompt}
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-xl rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-900">
                  {!turn.response && !turn.error && (
                    <span className="flex items-center gap-2 text-slate-500">
                      <Loader2 size={14} className="animate-spin" /> running...
                    </span>
                  )}
                  {turn.error && <span className="text-rose-600">{turn.error}</span>}
                  {turn.response && (
                    <>
                      <div className="whitespace-pre-wrap">{turn.response.message || <span className="text-slate-400">(empty response)</span>}</div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2 text-[10px] text-slate-500">
                        {turn.response.model && (
                          <span className="rounded bg-white px-1.5 py-0.5 font-mono">{turn.response.model}</span>
                        )}
                        <span>{turn.response.inputTokens} in · {turn.response.outputTokens} out tokens</span>
                        <span>· {turn.response.latencyMs}ms</span>
                      </div>
                      {turn.response.toolCalls && turn.response.toolCalls.length > 0 && (
                        <details className="mt-2 text-xs text-slate-700">
                          <summary className="cursor-pointer font-semibold text-slate-600">
                            Tool calls ({turn.response.toolCalls.length})
                          </summary>
                          <ul className="mt-2 space-y-1">
                            {turn.response.toolCalls.map((tc, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <Wrench size={12} className="mt-0.5 text-slate-500" />
                                <div className="min-w-0 flex-1">
                                  <div>
                                    <span className="font-mono">{tc.tool}</span>
                                    <span className="text-slate-500"> · plugin <span className="font-mono">{tc.plugin}</span></span>
                                    {tc.durationMs != null && <span className="text-slate-400"> · {tc.durationMs}ms</span>}
                                  </div>
                                  {tc.argumentsJson && (
                                    <pre className="mt-0.5 overflow-x-auto rounded bg-white p-1 font-mono text-[10px] text-slate-600">{tc.argumentsJson}</pre>
                                  )}
                                  {tc.resultPreview && (
                                    <pre className="mt-0.5 max-h-32 overflow-auto rounded bg-white p-1 font-mono text-[10px] text-slate-500">{tc.resultPreview}</pre>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <form
          className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3"
          onSubmit={e => { e.preventDefault(); submit(); }}
        >
          <input
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder={`Send a prompt to ${agent.displayName}...`}
            disabled={run.isPending}
            className="input flex-1"
            autoFocus
          />
          <button
            type="submit"
            disabled={run.isPending || message.trim().length === 0}
            className="btn"
          >
            {run.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
