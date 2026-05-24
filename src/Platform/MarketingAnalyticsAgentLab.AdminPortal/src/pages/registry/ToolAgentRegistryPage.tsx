import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bot, Boxes, FileJson2, Search, Wrench } from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '../../components/PageHeader';
import Tabs, { type TabItem } from '../../components/Tabs';
import Badge from '../../components/Badge';
import { AgentStatusBadge, ToolStatusBadge, WriteSafetyBadge } from '../../components/StatusBadge';
import DataTable, { type Column } from '../../components/DataTable';
import { agentsApi, catalogApi, openApiSourcesApi, toolsApi } from '../../services/api';
import type {
  AgentDefinition,
  AgentStatus,
  Endpoint,
  RegistryTool,
  ToolStatus,
} from '../../data/types';

type Tab = 'tools' | 'agents';

const tabs: TabItem<Tab>[] = [
  { id: 'tools',  label: 'Tools' },
  { id: 'agents', label: 'Agents' },
];

const toolStatusFilters: (ToolStatus | 'All')[] = ['All', 'Published', 'InReview', 'Draft', 'Deprecated'];
const agentStatusFilters: (AgentStatus | 'All')[] = ['All', 'Published', 'Draft', 'Disabled'];

export default function ToolAgentRegistryPage() {
  const [search] = useSearchParams();
  const initialTab = search.get('view') === 'agents' ? 'agents' : 'tools';
  const initialToolFilter = (search.get('filter') as ToolStatus | null) ?? 'All';

  const [tab, setTab] = useState<Tab>(initialTab);
  const [toolFilter, setToolFilter] = useState<ToolStatus | 'All'>(initialToolFilter);
  const [agentFilter, setAgentFilter] = useState<AgentStatus | 'All'>('All');
  const [query, setQuery] = useState('');

  const tools = useQuery({ queryKey: ['tools'], queryFn: () => toolsApi.listRegistryTools() });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => agentsApi.list() });
  const products = useQuery({ queryKey: ['products'], queryFn: () => catalogApi.listProducts() });
  const sources = useQuery({ queryKey: ['openapi.sources'], queryFn: () => openApiSourcesApi.list() });
  const endpoints = useQuery({ queryKey: ['endpoints'], queryFn: () => catalogApi.listEndpoints() });

  const productById = useMemo(
    () => new Map((products.data ?? []).map(p => [p.id, p])),
    [products.data],
  );
  const moduleById = useMemo(() => {
    const map = new Map<string, { name: string; displayName: string }>();
    for (const p of products.data ?? []) {
      for (const m of p.modules) map.set(m.id, { name: m.name, displayName: m.displayName });
    }
    return map;
  }, [products.data]);
  const endpointById = useMemo(
    () => new Map<string, Endpoint>((endpoints.data ?? []).map(e => [e.id, e])),
    [endpoints.data],
  );
  const sourceById = useMemo(
    () => new Map((sources.data ?? []).map(s => [s.id, s])),
    [sources.data],
  );

  /** Reverse index: tool id -> agent names that have it attached. */
  const agentsByToolId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of agents.data ?? []) {
      for (const tid of a.toolIds) {
        const arr = map.get(tid) ?? [];
        arr.push(a.name);
        map.set(tid, arr);
      }
    }
    return map;
  }, [agents.data]);

  const filteredTools = useMemo(() => {
    const all = tools.data ?? [];
    const byStatus = toolFilter === 'All' ? all : all.filter(t => t.status === toolFilter);
    const q = query.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter(t =>
      t.toolName.toLowerCase().includes(q) ||
      t.configuration.toolDescription.toLowerCase().includes(q) ||
      t.productId.toLowerCase().includes(q),
    );
  }, [tools.data, toolFilter, query]);

  const filteredAgents = useMemo(() => {
    const all = agents.data ?? [];
    const byStatus = agentFilter === 'All' ? all : all.filter(a => a.status === agentFilter);
    const q = query.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.displayName.toLowerCase().includes(q),
    );
  }, [agents.data, agentFilter, query]);

  const toolColumns: Column<RegistryTool>[] = [
    {
      key: 'tool',
      header: 'Tool',
      render: r => (
        <div className="flex items-start gap-2">
          <Wrench size={14} className="mt-0.5 text-brand-600" />
          <div>
            <div className="flex items-center gap-1.5">
              <Link to={`/api-catalog/${r.endpointId}`} className="font-mono font-medium text-slate-900 hover:text-brand-700">
                {r.toolName}
              </Link>
              {r.isSeed && <Badge tone="warning">Sample</Badge>}
              {!r.isSeed && <Badge tone="info">Real</Badge>}
            </div>
            <div className="text-xs text-slate-500 line-clamp-1">{r.configuration.toolDescription}</div>
            <div className="mt-0.5 text-[10px] text-slate-400">v{r.version} · {r.owner}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'product',
      header: 'Product / Module',
      render: r => {
        const p = productById.get(r.productId);
        const m = moduleById.get(r.moduleId);
        return (
          <div className="text-xs">
            <div className="text-slate-800">{p?.displayName ?? r.productId}</div>
            <div className="text-slate-500">{m?.displayName ?? r.moduleId.split('.').pop()}</div>
          </div>
        );
      },
    },
    {
      key: 'source',
      header: 'Source endpoint',
      render: r => {
        const ep = endpointById.get(r.endpointId);
        if (!ep) {
          return <span className="text-xs text-slate-400">endpoint not found</span>;
        }
        return (
          <div className="text-xs">
            <div className="flex items-center gap-1.5 font-mono text-slate-800">
              <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold">{ep.method}</span>
              <span className="truncate" title={ep.path}>{ep.path}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
              <FileJson2 size={10} />
              {ep.sourceId
                ? sourceById.get(ep.sourceId)?.displayName ?? ep.sourceId
                : 'sample data (no OpenAPI source)'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'safety',
      header: 'Type',
      render: r => {
        const ep = endpointById.get(r.endpointId);
        return ep ? <WriteSafetyBadge writeSafety={ep.writeSafety} /> : <Badge tone="neutral">—</Badge>;
      },
    },
    { key: 'status',  header: 'Status',  render: r => <ToolStatusBadge status={r.status} /> },
    {
      key: 'permissions',
      header: 'Required permissions',
      render: r => {
        const roles = r.configuration.permissions.allowedRoles;
        return (
          <div className="flex flex-wrap gap-1">
            {roles.length === 0
              ? <span className="text-[11px] text-slate-400">none</span>
              : roles.map(role => <Badge key={role} tone="neutral" mono>{role}</Badge>)}
            {r.configuration.permissions.requiresApproval && <Badge tone="warning">approval</Badge>}
          </div>
        );
      },
    },
    {
      key: 'used',
      header: 'Used by agents',
      render: r => {
        const names = agentsByToolId.get(r.id) ?? [];
        if (names.length === 0) {
          return <span className="text-[11px] text-slate-400">not attached</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {names.slice(0, 3).map(n => <Badge key={n} tone="brand" mono>{n}</Badge>)}
            {names.length > 3 && <Badge tone="neutral">+{names.length - 3}</Badge>}
          </div>
        );
      },
    },
    {
      key: 'published',
      header: 'Published',
      render: r => <span className="text-[11px] text-slate-500">{r.publishedAt ? new Date(r.publishedAt).toLocaleDateString() : '—'}</span>,
    },
  ];

  const agentColumns: Column<AgentDefinition>[] = [
    {
      key: 'agent',
      header: 'Agent',
      render: a => (
        <div className="flex items-start gap-2">
          <Bot size={14} className="mt-0.5 text-brand-600" />
          <div>
            <Link to={`/agents/${a.id}`} className="font-medium text-slate-900 hover:text-brand-700">{a.displayName}</Link>
            <div className="font-mono text-[11px] text-slate-500">{a.name}</div>
          </div>
        </div>
      ),
    },
    { key: 'kind',      header: 'Kind',       render: a => <Badge tone={a.kind === 'workflow' ? 'purple' : 'brand'}>{a.kind}</Badge> },
    { key: 'assistant', header: 'Assistant',  render: a => <span className="font-mono text-xs text-slate-700">{a.assistantId}</span> },
    { key: 'model',     header: 'Model',      render: a => <span className="font-mono text-xs">{a.model}</span> },
    { key: 'tools',     header: 'Tools',      render: a => <span className="tabular-nums">{a.toolIds.length}</span>, align: 'right' },
    { key: 'kb',        header: 'Knowledge',  render: a => <span className="tabular-nums">{a.knowledgeSourceIds.length}</span>, align: 'right' },
    { key: 'status',    header: 'Status',     render: a => <AgentStatusBadge status={a.status} /> },
    { key: 'owner',     header: 'Owner',      render: a => <span className="text-xs text-slate-700">{a.owner}</span> },
    { key: 'updated',   header: 'Updated',    render: a => <span className="text-xs text-slate-500">{new Date(a.updatedAt).toLocaleDateString()}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Tool & Agent Registry"
        subtitle="Every tool created from an OpenAPI endpoint, with its source, version, governance posture, and the agents that use it. This is the catalog the Agents page attaches from."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="success"><Boxes size={11} /> {tools.data?.length ?? '—'} tools</Badge>
            <Badge tone="brand"><Bot size={11} /> {agents.data?.length ?? '—'} agents</Badge>
          </div>
        }
      />

      <div className="space-y-4 p-8">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs tabs={tabs} active={tab} onSelect={setTab} className="border-0" />
          <div className="ml-auto relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input w-72 pl-7" placeholder="Search..." value={query} onChange={e => setQuery(e.target.value)} />
          </div>
        </div>

        {tab === 'tools' && (
          <>
            <div className="flex gap-1">
              {toolStatusFilters.map(s => (
                <button
                  key={s}
                  onClick={() => setToolFilter(s)}
                  className={clsx('pill', toolFilter === s ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
                >
                  {s}
                </button>
              ))}
            </div>
            <DataTable rows={filteredTools} columns={toolColumns} rowKey={r => r.id} empty="No tools match." />
          </>
        )}

        {tab === 'agents' && (
          <>
            <div className="flex gap-1">
              {agentStatusFilters.map(s => (
                <button
                  key={s}
                  onClick={() => setAgentFilter(s)}
                  className={clsx('pill', agentFilter === s ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
                >
                  {s}
                </button>
              ))}
            </div>
            <DataTable rows={filteredAgents} columns={agentColumns} rowKey={r => r.id} empty="No agents match." />
          </>
        )}
      </div>
    </>
  );
}
