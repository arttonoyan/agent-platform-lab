import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign, Gauge, Search } from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '../../components/PageHeader';
import Tabs, { type TabItem } from '../../components/Tabs';
import Badge from '../../components/Badge';
import { ExecutionStatusBadge } from '../../components/StatusBadge';
import DataTable, { type Column } from '../../components/DataTable';
import MetricCard from '../../components/MetricCard';
import { observabilityApi } from '../../services/api';
import type { AuditEvent, ExecutionStatus, ExecutionTrace } from '../../data/types';

type Tab = 'executions' | 'audit';

const tabs: TabItem<Tab>[] = [
  { id: 'executions', label: 'Executions' },
  { id: 'audit',      label: 'Audit' },
];

const statusFilters: (ExecutionStatus | 'all')[] = ['all', 'success', 'tool-error', 'policy-denied', 'llm-error', 'timeout'];

export default function ExecutionsAuditPage() {
  const executions = useQuery({ queryKey: ['executions'], queryFn: () => observabilityApi.listExecutions() });
  const audits = useQuery({ queryKey: ['audit'], queryFn: () => observabilityApi.listAuditEvents() });

  const [tab, setTab] = useState<Tab>('executions');
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | 'all'>('all');
  const [query, setQuery] = useState('');

  const filteredExecutions = useMemo(() => {
    const all = executions.data ?? [];
    const byStatus = statusFilter === 'all' ? all : all.filter(e => e.status === statusFilter);
    const q = query.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter(e =>
      e.userMessage.toLowerCase().includes(q) ||
      e.agentName.toLowerCase().includes(q) ||
      e.tenantId.toLowerCase().includes(q) ||
      e.userId.toLowerCase().includes(q),
    );
  }, [executions.data, statusFilter, query]);

  const filteredAudits = useMemo(() => {
    const all = audits.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(a =>
      a.targetName.toLowerCase().includes(q) ||
      a.actor.toLowerCase().includes(q) ||
      a.action.toLowerCase().includes(q),
    );
  }, [audits.data, query]);

  const executionTotals = useMemo(() => {
    const all = executions.data ?? [];
    const success = all.filter(e => e.status === 'success').length;
    const totalCost = all.reduce((s, e) => s + e.costUsd, 0);
    const avgLatency = all.length === 0 ? 0 : all.reduce((s, e) => s + e.latencyMs, 0) / all.length;
    return {
      total: all.length,
      successRate: all.length === 0 ? 0 : success / all.length,
      cost: totalCost,
      avgLatency: Math.round(avgLatency),
    };
  }, [executions.data]);

  const executionColumns: Column<ExecutionTrace>[] = [
    {
      key: 'time',
      header: 'When',
      render: r => <span className="text-xs text-slate-500">{new Date(r.timestamp).toLocaleString()}</span>,
    },
    {
      key: 'message',
      header: 'User message',
      render: r => (
        <div className="max-w-md">
          <Link to={`/executions/${r.id}`} className="text-sm font-medium text-slate-900 hover:text-brand-700 line-clamp-1">
            {r.userMessage}
          </Link>
          <div className="text-xs text-slate-500 line-clamp-1">{r.agentResponse}</div>
        </div>
      ),
    },
    { key: 'agent',   header: 'Agent',     render: r => <Badge tone="brand" mono>{r.agentName}</Badge> },
    { key: 'tenant',  header: 'Tenant',    render: r => <span className="font-mono text-xs">{r.tenantId}</span> },
    { key: 'tools',   header: 'Tools',     render: r => <span className="tabular-nums">{r.tools.length}</span>, align: 'right' },
    { key: 'tokens',  header: 'Tokens',    render: r => <span className="tabular-nums text-xs">{(r.inputTokens + r.outputTokens).toLocaleString()}</span>, align: 'right' },
    { key: 'cost',    header: 'Cost',      render: r => <span className="tabular-nums text-xs">${r.costUsd.toFixed(4)}</span>, align: 'right' },
    { key: 'lat',     header: 'Latency',   render: r => <span className="tabular-nums text-xs">{r.latencyMs} ms</span>, align: 'right' },
    { key: 'status',  header: 'Status',    render: r => <ExecutionStatusBadge status={r.status} /> },
  ];

  const auditColumns: Column<AuditEvent>[] = [
    { key: 'time',     header: 'When',     render: r => <span className="text-xs text-slate-500">{new Date(r.timestamp).toLocaleString()}</span> },
    { key: 'action',   header: 'Action',   render: r => <Badge tone="info" mono>{r.action}</Badge> },
    { key: 'actor',    header: 'Actor',    render: r => (
      <div>
        <div className="text-sm text-slate-800">{r.actor}</div>
        <div className="text-xs text-slate-500">{r.actorRole}</div>
      </div>
    )},
    { key: 'target',   header: 'Target',   render: r => (
      <div>
        <div className="font-mono text-xs text-slate-800">{r.targetName}</div>
        <div className="text-[10px] uppercase text-slate-500">{r.targetType}</div>
      </div>
    )},
    { key: 'desc',     header: 'Description', render: r => <span className="text-sm text-slate-700">{r.description}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Executions / Audit"
        subtitle="One row per agent interaction — what the user asked, what the gateway routed to, every tool call, the policy decisions, the trace id. Plus a parallel audit feed for governance changes."
      />

      <div className="space-y-6 p-8">
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Recorded executions" value={executionTotals.total} hint="(window)" />
          <MetricCard label="Success rate"        value={`${(executionTotals.successRate * 100).toFixed(1)}%`} trendTone="success" />
          <MetricCard label="Avg latency"         value={`${executionTotals.avgLatency} ms`} Icon={Gauge} />
          <MetricCard label="Sum cost"            value={`$${executionTotals.cost.toFixed(4)}`} Icon={CircleDollarSign} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Tabs tabs={tabs} active={tab} onSelect={setTab} className="border-0" />
          <div className="ml-auto relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input w-72 pl-7" placeholder="Search..." value={query} onChange={e => setQuery(e.target.value)} />
          </div>
        </div>

        {tab === 'executions' && (
          <>
            <div className="flex flex-wrap gap-1">
              {statusFilters.map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={clsx('pill', statusFilter === s ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
                >
                  {s === 'all' ? 'All' : s}
                </button>
              ))}
            </div>
            <DataTable
              rows={filteredExecutions}
              columns={executionColumns}
              rowKey={r => r.id}
              empty="No executions match."
            />
          </>
        )}

        {tab === 'audit' && (
          <DataTable rows={filteredAudits} columns={auditColumns} rowKey={r => r.id} empty="No audit events match." />
        )}
      </div>
    </>
  );
}
