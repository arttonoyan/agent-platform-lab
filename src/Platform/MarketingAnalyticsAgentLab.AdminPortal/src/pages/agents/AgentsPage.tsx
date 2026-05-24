import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bot, GitBranch, Search } from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import { AgentStatusBadge } from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import { agentsApi, catalogApi } from '../../services/api';
import type { AgentDefinition } from '../../data/types';

type Filter = 'All' | AgentDefinition['kind'] | AgentDefinition['status'];

const filters: Filter[] = ['All', 'single', 'workflow', 'Published', 'Draft', 'Disabled'];

export default function AgentsPage() {
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => agentsApi.list() });
  const products = useQuery({ queryKey: ['products'], queryFn: () => catalogApi.listProducts() });
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const all = agents.data ?? [];
    const f = all.filter(a => {
      if (filter === 'single' || filter === 'workflow') return a.kind === filter;
      if (filter === 'Published' || filter === 'Draft' || filter === 'Disabled') return a.status === filter;
      return true;
    });
    const q = query.trim().toLowerCase();
    if (!q) return f;
    return f.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.displayName.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.routingHints.some(h => h.toLowerCase().includes(q)),
    );
  }, [agents.data, filter, query]);

  const productById = useMemo(
    () => new Map((products.data ?? []).map(p => [p.id, p])),
    [products.data],
  );

  return (
    <>
      <PageHeader
        title="Agents"
        subtitle="Single agents and multi-step workflows built on the Microsoft Agent Framework. Each agent is mounted under an Atlas-routable assistant id."
        actions={
          <Link to="/agents/agt_marketing_analytics" className="btn">
            <Bot size={14} /> Open Agent Builder
          </Link>
        }
      />

      <div className="space-y-4 p-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input w-72 pl-7"
              placeholder="Search agents, hints…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-1">
            {filters.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  'pill',
                  filter === f ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 && (
          <EmptyState
            Icon={Bot}
            title="No agents match"
            description="Try a different filter or search term."
          />
        )}

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {rows.map(a => {
            const product = productById.get(a.productId);
            return (
              <Link key={a.id} to={`/agents/${a.id}`} className="card flex flex-col p-5 transition hover:border-brand-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-brand-50 p-2 text-brand-600">
                      {a.kind === 'workflow' ? <GitBranch size={16} /> : <Bot size={16} />}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{a.displayName}</div>
                      <div className="font-mono text-[11px] text-slate-500">{a.name}</div>
                    </div>
                  </div>
                  <AgentStatusBadge status={a.status} />
                </div>

                <p className="mt-3 text-sm text-slate-600 line-clamp-2">{a.description}</p>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Model"      value={<span className="font-mono">{a.model}</span>} />
                  <Stat label="Assistant"  value={<span className="font-mono">{a.assistantId}</span>} />
                  <Stat label="Tools"      value={`${a.toolIds.length} attached`} />
                  <Stat label="Knowledge"  value={`${a.knowledgeSourceIds.length} sources`} />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge tone={a.kind === 'workflow' ? 'purple' : 'brand'}>
                    {a.kind === 'workflow' ? 'workflow' : 'single agent'}
                  </Badge>
                  {product && <Badge tone="neutral">{product.displayName}</Badge>}
                  {a.permissions.requiresApproval && <Badge tone="warning">requires approval</Badge>}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md bg-slate-50 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-slate-800">{value}</div>
    </div>
  );
}
