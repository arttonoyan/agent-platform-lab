import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  ShieldX,
  User,
  Wrench,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import JsonBlock from '../../components/JsonBlock';
import { ExecutionStatusBadge } from '../../components/StatusBadge';
import { observabilityApi } from '../../services/api';
import type { ExecutionToolCall } from '../../data/types';

export default function ExecutionDetailPage() {
  const { executionId = '' } = useParams();
  const exec = useQuery({ queryKey: ['execution', executionId], queryFn: () => observabilityApi.getExecution(executionId), enabled: !!executionId });

  if (!exec.data) return <div className="p-8 text-sm text-slate-500">Loading execution…</div>;
  const e = exec.data;

  return (
    <>
      <PageHeader
        title="Execution trace"
        subtitle={e.userMessage}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/executions" className="btn-ghost"><ArrowLeft size={14} /> All executions</Link>
          </div>
        }
      />

      <div className="grid gap-6 p-8 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
          <section className="card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <ExecutionStatusBadge status={e.status} />
              <Badge tone="brand" mono><Bot size={11} /> {e.agentName}</Badge>
              <Badge tone="neutral" mono>{e.model}</Badge>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-500">{e.latencyMs} ms</span>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-500">{(e.inputTokens + e.outputTokens).toLocaleString()} tokens</span>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-500">${e.costUsd.toFixed(4)}</span>
              <span className="ml-auto font-mono text-[11px] text-slate-500">trace {e.traceId}</span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Bubble who="user"  text={e.userMessage} />
              <Bubble who="agent" text={e.agentResponse} />
            </div>
          </section>

          <section className="card">
            <div className="card-header flex items-center justify-between">
              <span>Tool calls in this execution</span>
              <span className="text-xs text-slate-500">{e.tools.length} call{e.tools.length === 1 ? '' : 's'}</span>
            </div>
            <ol className="divide-y divide-slate-100">
              {e.tools.map((t, i) => <ToolCallRow key={i} idx={i} call={t} />)}
            </ol>
          </section>

          <section className="card">
            <div className="card-header">Trace timeline (mock OTel spans)</div>
            <div className="px-5 py-4">
              <SpanTree exec={e} />
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <div className="section-title">Context</div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="Assistant id" value={<span className="font-mono text-xs">{e.assistantId}</span>} />
              <Row label="Product"      value={<span className="font-mono text-xs">{e.productId}</span>} />
              <Row label="Tenant"       value={<span className="font-mono text-xs">{e.tenantId}</span>} />
              <Row label="User"         value={<span className="font-mono text-xs"><User size={11} className="inline" /> {e.userId}</span>} />
              <Row label="Timestamp"    value={<span className="text-xs">{new Date(e.timestamp).toLocaleString()}</span>} />
              <Row label="Router"       value={<span className="text-xs text-slate-700">{e.routerReason}</span>} />
            </dl>
          </section>

          <section className="card p-5">
            <div className="section-title">Cost / latency</div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="Latency"        value={<span className="tabular-nums"><Gauge size={11} className="inline" /> {e.latencyMs} ms</span>} />
              <Row label="Input tokens"   value={<span className="tabular-nums">{e.inputTokens.toLocaleString()}</span>} />
              <Row label="Output tokens"  value={<span className="tabular-nums">{e.outputTokens.toLocaleString()}</span>} />
              <Row label="Cost"           value={<span className="tabular-nums"><CircleDollarSign size={11} className="inline" /> ${e.costUsd.toFixed(4)}</span>} />
            </dl>
          </section>

          <section className="card p-5">
            <div className="section-title">Governance verdict</div>
            <ul className="mt-3 space-y-2 text-xs">
              {e.tools.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  {t.policyDecision === 'allow'
                    ? <CheckCircle2 size={13} className="mt-0.5 text-emerald-600" />
                    : <ShieldX size={13} className="mt-0.5 text-rose-600" />}
                  <div>
                    <div className="font-mono text-slate-800">{t.toolName}</div>
                    <div className="text-slate-500">{t.policyDecision === 'allow' ? 'allowed' : `denied: ${t.policyReason ?? 'policy violation'}`}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}

function Bubble({ who, text }: { who: 'user' | 'agent'; text: string }) {
  return (
    <div className={clsx('rounded-lg border px-3 py-2.5 text-sm leading-relaxed', who === 'user' ? 'border-slate-200 bg-slate-50 text-slate-800' : 'border-brand-100 bg-brand-50/60 text-brand-900')}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider">
        {who === 'user' ? 'User' : 'Agent'}
      </div>
      {text}
    </div>
  );
}

function ToolCallRow({ idx, call }: { idx: number; call: ExecutionToolCall }) {
  const ok = call.statusCode >= 200 && call.statusCode < 300 && call.policyDecision === 'allow';
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">#{idx + 1}</span>
        <Wrench size={13} className="text-brand-600" />
        <span className="font-mono font-medium text-slate-900">{call.toolName}</span>
        <Badge tone="neutral">{call.productId}</Badge>
        <Badge tone={ok ? 'success' : call.policyDecision === 'deny' ? 'danger' : 'warning'}>
          {call.policyDecision === 'deny' ? 'denied' : call.statusCode}
        </Badge>
        <span className="ml-auto text-slate-500">{call.durationMs} ms</span>
      </div>
      {call.policyReason && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-800">
          <XCircle size={12} /> {call.policyReason}
        </div>
      )}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div>
          <div className="section-title">Arguments</div>
          <JsonBlock value={call.arguments} maxHeight="14rem" />
        </div>
        <div>
          <div className="section-title">Result</div>
          <JsonBlock value={call.result} maxHeight="14rem" />
        </div>
      </div>
    </li>
  );
}

function SpanTree({ exec }: { exec: ReturnType<typeof observabilityApi.getExecution> extends Promise<infer T> ? Exclude<T, undefined> : never }) {
  const spans = [
    { name: 'AssistantInteraction',     depth: 0, kind: 'server',   tag: '@gateway' },
    { name: 'AssistantRegistry.Resolve', depth: 1, kind: 'client',  tag: '@gateway' },
    { name: 'AgentRouter.Resolve',       depth: 1, kind: 'internal', tag: '@gateway' },
    { name: 'AgentRuntime.Execute',     depth: 1, kind: 'client',   tag: '@runtime' },
    { name: 'AIAgent.Run',              depth: 2, kind: 'internal', tag: '@runtime' },
    { name: 'chat.completions',         depth: 3, kind: 'client',   tag: '@openai' },
    ...exec.tools.flatMap(t => [
      { name: `mcp.callTool ${t.toolName}`,   depth: 3, kind: 'client', tag: '@runtime' },
      { name: 'plugin.policy.evaluate',       depth: 4, kind: 'internal', tag: '@gateway' },
      { name: `HTTP ${t.toolName}`,           depth: 4, kind: 'client', tag: t.productId },
    ]),
    { name: 'chat.completions (continuation)', depth: 3, kind: 'client', tag: '@openai' },
  ];

  return (
    <div className="space-y-0.5 font-mono text-[12px] text-slate-700">
      {spans.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-slate-300" style={{ paddingLeft: s.depth * 14 }}>{'├──'}</span>
          <span className="flex-1 truncate">{s.name}</span>
          <span className="text-[10px] text-slate-400">[{s.tag}]</span>
        </div>
      ))}
    </div>
  );
}
