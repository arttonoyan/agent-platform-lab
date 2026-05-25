import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, ExternalLink, FlaskConical, Plus, RefreshCcw, Save } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { api, platformUrls, type AgentDefinition } from '../lib/platform';

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
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.listAgents() });
  const plugins = useQuery({ queryKey: ['plugins', 'all'], queryFn: () => api.listPlugins() });
  const live = useQuery({ queryKey: ['live-agents'], queryFn: () => api.listLiveAgents(), refetchInterval: 5_000 });
  const [editing, setEditing] = useState<AgentDefinition | null>(null);

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
            <button className="btn" onClick={() => setEditing({ ...blank })}>
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
            For interactive testing, trace inspection, and workflow visualization,
            <a href={devUiUrl} target="_blank" rel="noreferrer" className="ml-1 underline">open the DevUI dashboard</a>
            served in-process by the AgentRuntime.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {agents.data?.map(a => {
            const status = live.data?.find(l => l.name === a.name);
            return (
              <div key={a.id} className="card flex flex-col">
                <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <Bot size={18} className="mt-0.5 text-brand-600" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{a.displayName}</div>
                      <div className="font-mono text-xs text-slate-500">{a.name}</div>
                    </div>
                  </div>
                  <span
                    className={`pill ${status ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
                    title={status ? `Live with ${status.tools.length} tools` : 'Not loaded yet by AgentRuntime'}
                  >
                    {status ? 'live' : 'pending'}
                  </span>
                </div>
                <div className="flex-1 space-y-2 px-5 py-3 text-xs text-slate-600">
                  <div>{a.description}</div>
                  <div>
                    <span className="font-semibold text-slate-700">Model:</span>{' '}
                    <span className="font-mono">{a.modelDeployment}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Attached Tool Sets:</span>{' '}
                    {a.pluginIds.length === 0
                      ? <span className="text-slate-400">(none attached)</span>
                      : <span>{a.pluginIds.length}</span>}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Routing hints:</span>{' '}
                    {a.routingHints && a.routingHints.length > 0
                      ? a.routingHints.map(h => <span key={h} className="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{h}</span>)
                      : <span className="text-slate-400">none</span>}
                  </div>
                  {status && (
                    <div>
                      <span className="font-semibold text-slate-700">Live tools:</span>{' '}
                      {status.tools.length === 0 ? <span className="text-slate-400">(none)</span> : <span className="font-mono">{status.tools.length}</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-2">
                  <button className="btn-ghost" onClick={() => setEditing(a)}>
                    Edit metadata
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
    </>
  );
}
