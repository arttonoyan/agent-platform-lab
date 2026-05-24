import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Bot,
  CheckCircle2,
  Database,
  Gauge,
  Network,
  ScrollText,
  ShieldCheck,
  XCircle,
  Zap,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import FlowDiagram from '../../components/FlowDiagram';
import DataTable, { type Column } from '../../components/DataTable';
import SectionTitle from '../../components/SectionTitle';
import { agentsApi, gatewayApi } from '../../services/api';
import type { GatewayAssistant, GatewayInvocationSummary, GatewayPolicy } from '../../data/types';

export default function AiGatewayPage() {
  const assistants = useQuery({ queryKey: ['gateway.assistants'], queryFn: () => gatewayApi.listAssistants() });
  const policies = useQuery({ queryKey: ['gateway.policies'], queryFn: () => gatewayApi.listPolicies() });
  const rateLimits = useQuery({ queryKey: ['gateway.rate-limits'], queryFn: () => gatewayApi.listRateLimits() });
  const invocations = useQuery({ queryKey: ['gateway.invocations'], queryFn: () => gatewayApi.listRecentInvocations(), refetchInterval: 10_000 });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => agentsApi.list() });

  const assistantColumns: Column<GatewayAssistant>[] = [
    { key: 'id',         header: 'Assistant id', render: a => <span className="font-mono text-xs text-slate-800">{a.assistantId}</span> },
    { key: 'name',       header: 'Display',      render: a => <span className="text-slate-800">{a.displayName}</span> },
    { key: 'product',    header: 'Product',      render: a => <Badge tone="neutral">{a.productId}</Badge> },
    {
      key: 'agents',
      header: 'Agents',
      render: a => (
        <div className="flex flex-wrap gap-1">
          {a.agentIds.map(id => {
            const agent = agents.data?.find(x => x.id === id);
            return agent
              ? <Link key={id} to={`/agents/${id}`}><Badge tone={a.defaultAgentId === id ? 'brand' : 'neutral'} mono>{agent.name}</Badge></Link>
              : <Badge key={id} tone="neutral" mono>{id}</Badge>;
          })}
        </div>
      ),
    },
    { key: 'state', header: 'State', render: a => a.enabled ? <Badge tone="success"><CheckCircle2 size={11} /> enabled</Badge> : <Badge tone="danger"><XCircle size={11} /> disabled</Badge> },
  ];

  const policyColumns: Column<GatewayPolicy>[] = [
    { key: 'name', header: 'Policy', render: p => (
      <div>
        <div className="font-medium text-slate-800">{p.name}</div>
        <div className="text-xs text-slate-500">{p.description}</div>
      </div>
    )},
    { key: 'scope', header: 'Scope', render: p => <Badge tone="neutral">{p.scope}</Badge> },
    { key: 'rule', header: 'Rule', render: p => <code className="break-all rounded bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-700">{p.rule}</code> },
    { key: 'action', header: 'Action', render: p => (
      <Badge tone={p.action === 'deny' ? 'danger' : p.action === 'require-approval' ? 'warning' : p.action === 'rate-limit' ? 'info' : 'success'}>
        {p.action}
      </Badge>
    )},
    { key: 'state', header: '',
      render: p => p.enabled ? <Badge tone="success">on</Badge> : <Badge tone="neutral">off</Badge> },
  ];

  const invocationColumns: Column<GatewayInvocationSummary>[] = [
    { key: 'time',    header: 'When',       render: r => <span className="text-xs text-slate-500">{new Date(r.receivedAt).toLocaleTimeString()}</span> },
    { key: 'asst',    header: 'Assistant',  render: r => <span className="font-mono text-xs">{r.assistantId}</span> },
    { key: 'agent',   header: 'Resolved agent', render: r => <Link to="/agents" className="font-mono text-xs text-brand-700 hover:underline">{r.resolvedAgentName}</Link> },
    { key: 'tenant',  header: 'Tenant',     render: r => <span className="font-mono text-xs">{r.tenantId}</span> },
    { key: 'tools',   header: 'Tool calls', render: r => <span className="tabular-nums">{r.toolCallCount}</span>, align: 'right' },
    { key: 'lat',     header: 'Latency',    render: r => <span className="tabular-nums">{r.latencyMs} ms</span>, align: 'right' },
    { key: 'status',  header: 'Status',
      render: r => <Badge tone={r.status === 'ok' ? 'success' : r.status === 'policy-denied' ? 'danger' : 'warning'}>{r.status}</Badge> },
    { key: 'why',     header: 'Why this agent', render: r => <span className="text-xs text-slate-600">{r.routerReason}</span> },
  ];

  return (
    <>
      <PageHeader
        title="AI Gateway"
        subtitle="The product-side runtime plane. Atlas's assistant router resolves to one of these registered assistant ids; the gateway then picks an agent, enforces policy, executes tools, and records telemetry."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="success"><Activity size={11} /> live</Badge>
            <Link to="/executions" className="btn-ghost"><ScrollText size={14} /> Executions</Link>
          </div>
        }
      />

      <div className="space-y-8 p-8">
        {/* Atlas → Gateway diagram */}
        <section>
          <SectionTitle
            title="Request topology"
            description="Atlas is upstream — it owns the top-level assistant router and resolves the message to a product assistant. We are downstream, the product runtime."
          />
          <div className="mt-3 card p-5">
            <FlowDiagram
              steps={[
                { id: 'atlas',     label: 'Atlas',             hint: 'Top-level assistant router',     Icon: Zap,         tone: 'success' },
                { id: 'ingress',   label: 'Gateway ingress',   hint: 'Auth, tenant, trace context',    Icon: Network,     tone: 'brand'   },
                { id: 'context',   label: 'Context resolution', hint: 'User, tenant, product, roles', Icon: ShieldCheck, tone: 'brand'   },
                { id: 'select',    label: 'Agent selection',   hint: 'Router hints or workflow entry', Icon: Bot,         tone: 'brand'   },
                { id: 'execute',   label: 'Agent execution',   hint: 'LLM + tools + retrieval',        Icon: Activity,    tone: 'brand'   },
                { id: 'retrieve',  label: 'Vector retrieval',  hint: 'Qdrant / pgvector',              Icon: Database,    tone: 'neutral' },
                { id: 'policy',    label: 'Policy + audit',    hint: 'Per tool call',                  Icon: ShieldCheck, tone: 'brand'   },
                { id: 'response',  label: 'Response → Atlas',  hint: 'message + toolCalls + traceId',  Icon: Gauge,       tone: 'success' },
              ]}
            />
            <div className="mt-4 rounded-md border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-brand-900">
              <strong>This is intentionally not Atlas routing.</strong>{' '}
              Atlas already decides "this message belongs to <span className="font-mono">marketing_assistant</span>". Our gateway picks up from that point: it picks the right agent, executes tools under permission/policy, attaches an OpenTelemetry trace, and returns the structured response.
            </div>
          </div>
        </section>

        {/* Assistants */}
        <section>
          <SectionTitle title="Registered assistants" description="Each entry is an Atlas-routable assistant id fronting one or more agents." />
          <div className="mt-3">
            <DataTable rows={assistants.data ?? []} columns={assistantColumns} rowKey={r => r.assistantId} />
          </div>
        </section>

        {/* Recent invocations */}
        <section>
          <SectionTitle title="Live invocations" description="Refreshes every 10 seconds. Click an execution to drill into its full trace." />
          <div className="mt-3">
            <DataTable
              rows={invocations.data ?? []}
              columns={invocationColumns}
              rowKey={r => r.id}
            />
          </div>
        </section>

        {/* Policies + rate limits */}
        <section className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SectionTitle title="Policies" description="Evaluated on every tool call before the runtime hits the underlying API." />
            <div className="mt-3">
              <DataTable rows={policies.data ?? []} columns={policyColumns} rowKey={r => r.id} />
            </div>
          </div>
          <div>
            <SectionTitle title="Rate limits" description="Token bucket per scope." />
            <div className="mt-3 card">
              <ul className="divide-y divide-slate-100">
                {rateLimits.data?.map(r => (
                  <li key={r.id} className="px-5 py-3 text-sm">
                    <div className="font-mono text-slate-800">{r.scope}</div>
                    <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-slate-600">
                      <Cell label="/ min" value={r.perMinute.toLocaleString()} />
                      <Cell label="/ hour" value={r.perHour.toLocaleString()} />
                      <Cell label="/ day" value={r.perDay.toLocaleString()} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-slate-50 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="tabular-nums text-slate-800">{value}</div>
    </div>
  );
}
