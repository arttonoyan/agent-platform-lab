import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  Bot,
  ChevronRight,
  Cog,
  PlayCircle,
  Send,
  Server,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';
import StatusPill from '../StatusPill';
import { api, type AgentDefinition, type ApiSpecSummary, type PluginDefinition, type PluginStatus } from '../../lib/platform';
import { classifyService, isWriteMethod } from '../../lib/catalog';

const FILTERS: ('All' | PluginStatus)[] = ['All', 'Draft', 'Testing', 'Published', 'Disabled'];

/**
 * Main "Tool Sets" tab on the new /tools page. A Tool Set is the platform's primary
 * governed AI tooling object — a group of OpenAPI operations from one source, each
 * wrapped as a callable AI tool, with shared auth / permissions / lifecycle.
 *
 * Columns called out by the IA spec:
 *   name · description · status · # tools · source APIs · owner · used by agents · last updated
 *
 * "Used by N agents" is derived client-side from the agent list and links into the
 * Agents page (per the IA rule: Tools shows usage, Agents owns attach/detach).
 */
export default function ToolSetsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'All' | PluginStatus>('All');
  const [usageFor, setUsageFor] = useState<PluginDefinition | null>(null);

  const toolSets = useQuery({
    queryKey: ['plugins', filter],
    queryFn: () => api.listPlugins(filter === 'All' ? undefined : filter),
  });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => api.listAgents() });
  const specs = useQuery({ queryKey: ['apis'], queryFn: () => api.listApiSpecs() });

  const publish = useMutation({
    mutationFn: (id: string) => api.publishPlugin(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plugins'] }),
  });
  const unpublish = useMutation({
    mutationFn: (id: string) => api.unpublishPlugin(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plugins'] }),
  });

  // Agent count per Tool Set id, plus the actual agents using each Tool Set so the
  // usage drawer can name them. Computed once per render rather than per row.
  const agentsByToolSet = useMemo(() => {
    const map: Record<string, AgentDefinition[]> = {};
    for (const a of agents.data ?? []) {
      for (const pid of a.pluginIds) {
        (map[pid] ??= []).push(a);
      }
    }
    return map;
  }, [agents.data]);

  const specsById = useMemo(() => {
    const map: Record<string, ApiSpecSummary> = {};
    for (const s of specs.data ?? []) map[s.id] = s;
    return map;
  }, [specs.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Tool Sets are the platform's published units of AI tooling. Each row is one Tool Set —
          configure it, test it in the Playground, then publish so agents can attach it.
        </p>
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button
              key={f}
              type="button"
              className={`pill ${
                filter === f
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {toolSets.isPending && <p className="text-sm text-slate-500">Loading Tool Sets…</p>}
      {toolSets.error && <p className="text-sm text-rose-600">{(toolSets.error as Error).message}</p>}

      {toolSets.data && toolSets.data.length === 0 && (
        <div className="card flex flex-col items-center gap-3 px-5 py-10 text-center text-sm text-slate-500">
          <Wrench size={24} className="text-slate-400" />
          <div>
            <p className="font-medium text-slate-700">No Tool Sets yet.</p>
            <p className="mt-1 text-xs">
              Go to the <strong>Endpoints</strong> tab, pick one or more operations, and click
              <em> Create Tool Set from selected endpoints</em>.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {toolSets.data?.map(ts => {
          const spec = specsById[ts.apiSpecId];
          const sourceMeta = spec ? classifyService(spec.serviceName) : null;
          const usingAgents = agentsByToolSet[ts.id] ?? [];
          const writeCount = ts.endpoints.filter(e => isWriteMethod(e.method)).length;
          return (
            <article key={ts.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3">
                <div className="flex-1 min-w-[280px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/tools/tool-sets/${ts.id}`}
                      className="text-sm font-semibold text-slate-900 hover:text-brand-700"
                    >
                      {ts.displayName}
                    </Link>
                    <StatusPill status={ts.status} />
                    <span className="pill bg-slate-100 text-slate-600">Tool Set</span>
                    {writeCount > 0 && (
                      <span
                        className="pill bg-amber-100 text-amber-800"
                        title={`${writeCount} write ${writeCount === 1 ? 'tool' : 'tools'} — requires approval`}
                      >
                        <ShieldCheck size={10} className="mr-1 inline" />
                        {writeCount} write
                      </span>
                    )}
                  </div>
                  {ts.description && (
                    <p className="mt-1 text-xs text-slate-500">{ts.description}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link className="btn-ghost" to={`/tools/tool-sets/${ts.id}`} title="Open detail / configure tools">
                    <Cog size={14} /> Configure
                  </Link>
                  <Link
                    className="btn-ghost"
                    to={`/tools/tool-sets/${ts.id}?tab=playground`}
                    title="Open the Tool Playground"
                  >
                    <PlayCircle size={14} /> Playground
                  </Link>
                  {ts.status === 'Published' ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={unpublish.isPending}
                      onClick={() => unpublish.mutate(ts.id)}
                    >
                      <X size={14} /> Unpublish
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      disabled={publish.isPending}
                      onClick={() => publish.mutate(ts.id)}
                    >
                      <Send size={14} /> Publish
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    title="Disable this Tool Set (coming soon)"
                    disabled
                  >
                    <Ban size={14} />
                  </button>
                </div>
              </div>

              <dl className="grid gap-x-6 gap-y-2 px-5 py-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <Detail term="Tools" value={`${ts.endpoints.length}`} />
                <Detail
                  term="Source API"
                  value={
                    spec ? (
                      <Link to={`/tools/sources/${spec.id}`} className="hover:text-brand-700">
                        <span className="inline-flex items-center gap-1">
                          <Server size={11} className="text-slate-400" /> {spec.displayName}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-slate-400">(unknown source)</span>
                    )
                  }
                />
                <Detail term="Owner team" value={sourceMeta?.ownerTeam ?? '—'} />
                <Detail
                  term="Used by"
                  value={
                    usingAgents.length === 0 ? (
                      <span className="text-slate-400">no agents</span>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-900"
                        onClick={() => setUsageFor(ts)}
                      >
                        <Bot size={11} /> {usingAgents.length} {usingAgents.length === 1 ? 'agent' : 'agents'}
                        <ChevronRight size={11} />
                      </button>
                    )
                  }
                />
                <Detail
                  term="Last updated"
                  value={new Date(ts.updatedAt).toLocaleString()}
                  className="lg:col-span-2"
                />
                <Detail
                  term="Created"
                  value={new Date(ts.createdAt).toLocaleString()}
                  className="lg:col-span-2"
                />
              </dl>
            </article>
          );
        })}
      </div>

      <UsageDrawer toolSet={usageFor} agents={usageFor ? agentsByToolSet[usageFor.id] ?? [] : []} onClose={() => setUsageFor(null)} />
    </div>
  );
}

function Detail({ term, value, className }: { term: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{term}</dt>
      <dd className="mt-0.5 text-slate-700">{value}</dd>
    </div>
  );
}

/**
 * Right-side drawer listing the agents that currently attach a Tool Set. Lives in the
 * Tools section because "where is this Tool Set used?" is a Tools concern; modifying
 * the attachment is a one-click hop into the Agents page.
 */
function UsageDrawer({
  toolSet,
  agents,
  onClose,
}: {
  toolSet: PluginDefinition | null;
  agents: AgentDefinition[];
  onClose: () => void;
}) {
  if (!toolSet) return null;
  return (
    <div className="fixed inset-0 z-30 flex">
      <button type="button" aria-label="Close usage drawer" className="flex-1 bg-slate-900/30" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Usage</div>
            <div className="text-sm font-semibold text-slate-900">{toolSet.displayName}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {agents.length === 0
                ? 'Not yet attached to any agent.'
                : `Attached by ${agents.length} ${agents.length === 1 ? 'agent' : 'agents'}.`}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {agents.length === 0 ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle size={12} className="mr-1 inline" />
              Tools surface usage; agents own the attachment. To attach this Tool Set, open
              the <Link to="/agents" className="font-semibold underline">Agents</Link> page and pick an agent.
            </div>
          ) : (
            <ul className="space-y-2">
              {agents.map(a => (
                <li key={a.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{a.displayName}</div>
                      <div className="font-mono text-[11px] text-slate-500">{a.name}</div>
                    </div>
                    <Link to="/agents" className="text-xs text-brand-700 hover:text-brand-900">
                      Manage in Agents →
                    </Link>
                  </div>
                  {a.description && <p className="mt-1 text-xs text-slate-500">{a.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
          To detach or change which agent uses this Tool Set, go to
          <Link to="/agents" className="ml-1 font-semibold text-brand-700 hover:text-brand-900">
            Agents
          </Link>.
        </footer>
      </aside>
    </div>
  );
}
