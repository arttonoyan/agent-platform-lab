import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { api, type AssistantDefinition } from '../lib/platform';

const blank: AssistantDefinition = {
  assistantId: 'new_assistant',
  displayName: 'New Assistant',
  application: 'marketing',
  description: '',
  agentNames: [],
  defaultAgentName: null,
  systemPreamble: null,
  enabled: true,
};

export default function AssistantsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['assistants'], queryFn: () => api.listAssistants() });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.listAgents() });
  const [editing, setEditing] = useState<AssistantDefinition | null>(null);

  useEffect(() => {
    if (!editing && list.data?.[0]) setEditing(list.data[0]);
  }, [list.data, editing]);

  const save = useMutation({
    mutationFn: () => api.saveAssistant(editing!),
    onSuccess: saved => {
      setEditing(saved);
      qc.invalidateQueries({ queryKey: ['assistants'] });
    },
  });

  return (
    <>
      <PageHeader
        title="Assistants"
        subtitle="Atlas-facing entry points. One assistant per standalone app, fronting a pool of agents."
        actions={
          <button className="btn" onClick={() => setEditing({ ...blank })}>
            <Plus size={14} /> New assistant
          </button>
        }
      />
      <div className="px-8 pt-4">
        <div className="rounded-lg border border-brand-100 bg-brand-50/40 px-4 py-3 text-sm text-brand-900">
          <p className="font-medium">Assistants are the Atlas-facing entry point.</p>
          <p className="mt-1 text-brand-800/80">
            Atlas routes a user request to an <strong>Assistant</strong>. The Assistant routes to one or more
            <strong> Agents</strong>. Agents call <strong>Tools</strong> from their attached Tool Sets.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-6 p-8">
        <div className="space-y-2">
          {list.data?.map(a => (
            <button key={a.assistantId} className={`card w-full px-5 py-3 text-left ${editing?.assistantId === a.assistantId ? 'ring-2 ring-brand-500' : ''}`}
                    onClick={() => setEditing(a)}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">{a.displayName}</div>
                <span className={`pill ${a.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                  {a.enabled ? 'enabled' : 'disabled'}
                </span>
              </div>
              <div className="font-mono text-xs text-slate-500">{a.assistantId}</div>
              <div className="mt-1 text-xs text-slate-500">app: {a.application} · agents: {a.agentNames.length}</div>
            </button>
          ))}
        </div>

        {editing && (
          <div className="col-span-2 card p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Assistant id
                <input className="input mt-1 font-mono" value={editing.assistantId} onChange={e => setEditing({ ...editing, assistantId: e.target.value })} />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Display name
                <input className="input mt-1" value={editing.displayName} onChange={e => setEditing({ ...editing, displayName: e.target.value })} />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Application
                <input className="input mt-1 font-mono" value={editing.application} onChange={e => setEditing({ ...editing, application: e.target.value })} placeholder="marketing | fleet | ..." />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Default agent
                <select className="input mt-1" value={editing.defaultAgentName ?? ''} onChange={e => setEditing({ ...editing, defaultAgentName: e.target.value || null })}>
                  <option value="">(none)</option>
                  {agents.data?.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                </select>
              </label>
              <label className="col-span-2 block text-xs font-medium text-slate-600">
                Description
                <input className="input mt-1" value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} />
              </label>
              <label className="col-span-2 block text-xs font-medium text-slate-600">
                System preamble (optional)
                <textarea className="input mt-1 font-mono" rows={3} value={editing.systemPreamble ?? ''} onChange={e => setEditing({ ...editing, systemPreamble: e.target.value || null })} />
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input type="checkbox" checked={editing.enabled} onChange={e => setEditing({ ...editing, enabled: e.target.checked })} />
                Enabled
              </label>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Agents in this assistant</div>
              <div className="mt-2 grid gap-1 md:grid-cols-2">
                {agents.data?.map(a => {
                  const checked = editing.agentNames.includes(a.name);
                  return (
                    <label key={a.name} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked ? editing.agentNames.filter(x => x !== a.name) : [...editing.agentNames, a.name];
                          setEditing({ ...editing, agentNames: next });
                        }}
                      />
                      <div>
                        <div className="font-medium text-slate-900">{a.displayName}</div>
                        <div className="text-xs text-slate-500 font-mono">{a.name}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button className="btn" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save size={14} /> Save
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
