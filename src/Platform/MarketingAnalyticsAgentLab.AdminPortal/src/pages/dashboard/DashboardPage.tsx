import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bot,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  Database,
  FileJson2,
  FlaskConical,
  Gauge,
  Library,
  ListChecks,
  Network,
  Send,
  Wrench,
  Zap,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import MetricCard from '../../components/MetricCard';
import FlowDiagram from '../../components/FlowDiagram';
import SectionTitle from '../../components/SectionTitle';
import Badge from '../../components/Badge';
import { ExecutionStatusBadge } from '../../components/StatusBadge';
import { catalogApi, gatewayApi, metricsApi, observabilityApi, openApiSourcesApi } from '../../services/api';

export default function DashboardPage() {
  const metrics = useQuery({ queryKey: ['metrics'], queryFn: () => metricsApi.get() });
  const executions = useQuery({ queryKey: ['executions'], queryFn: () => observabilityApi.listExecutions() });
  const audits = useQuery({ queryKey: ['audit'], queryFn: () => observabilityApi.listAuditEvents() });
  const invocations = useQuery({ queryKey: ['gateway.invocations'], queryFn: () => gatewayApi.listRecentInvocations() });
  const sources = useQuery({ queryKey: ['openapi.sources'], queryFn: () => openApiSourcesApi.list() });
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => catalogApi.getCatalog() });

  const m = metrics.data;
  const liveSources = sources.data?.filter(s => s.status === 'ok').length ?? 0;
  const seededFallback = !!catalog.data?.seededFallback;

  return (
    <>
      <PageHeader
        title="AI Tooling Platform"
        subtitle="Turn any standalone-application OpenAPI surface into governed AI tools and agents — discoverable, testable, and routable through the AI Gateway."
        actions={
          <div className="flex items-center gap-2">
            {liveSources > 0
              ? <Badge tone="success"><CheckCircle2 size={12} /> {liveSources} OpenAPI source{liveSources === 1 ? '' : 's'} live</Badge>
              : <Badge tone="warning"><AlertTriangle size={12} /> No real OpenAPI source yet</Badge>}
            <Link to="/api-catalog/sources" className="btn-ghost">
              <FileJson2 size={14} /> OpenAPI Sources
            </Link>
            <Link to="/api-catalog" className="btn">
              <Library size={14} /> Browse APIs
            </Link>
          </div>
        }
      />

      <div className="space-y-8 p-8">
        {seededFallback && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            <div className="flex items-start gap-3">
              <FileJson2 size={18} className="mt-0.5 shrink-0 text-amber-700" />
              <div className="flex-1">
                <div className="text-sm font-semibold">No real OpenAPI source registered yet</div>
                <div className="mt-1 text-xs">
                  The API Catalog is showing sample data so you can click through the flow. Register a real OpenAPI 3 document on the OpenAPI Sources page to enable real tool execution.
                </div>
              </div>
              <Link to="/api-catalog/sources?new=1" className="btn shrink-0">
                <FileJson2 size={14} /> Register source
              </Link>
            </div>
          </div>
        )}

        {/* Metrics */}
        <section>
          <SectionTitle title="Platform health" description="Rolling 24-hour view across every product, agent, and tool." />
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Products imported"    value={m?.productsImported    ?? '—'} Icon={Library}  hint="standalone apps with OpenAPI metadata" />
            <MetricCard label="Endpoints available"  value={m?.endpointsAvailable  ?? '—'} Icon={Boxes}    hint="across all products and modules" />
            <MetricCard label="Tools published"      value={m?.toolsPublished      ?? '—'} Icon={Wrench}   trend={m ? `${m.toolsDraft} in draft / review` : ''} trendTone="neutral" />
            <MetricCard label="Agents live"          value={m?.agentsLive          ?? '—'} Icon={Bot}      hint="across 4 standalone-app assistants" />
            <MetricCard label="Knowledge collections" value={m?.knowledgeCollections ?? '—'} Icon={Database} hint={`${(m?.vectorChunks ?? 0).toLocaleString()} vector chunks indexed`} />
            <MetricCard label="Executions (24h)"     value={m?.executions24h.toLocaleString() ?? '—'} Icon={Activity} trend={m ? `${(m.successRate * 100).toFixed(1)}% success` : ''} trendTone="success" />
            <MetricCard label="p95 latency"          value={m ? `${m.p95LatencyMs} ms` : '—'} Icon={Gauge} hint="agent end-to-end (gateway → llm → tools)" />
            <MetricCard label="Cost (24h)"           value={m ? `$${m.costUsd24h.toFixed(2)}` : '—'} Icon={CircleDollarSign} trend={m ? `${m.policyDenials24h} policy denials` : ''} trendTone="neutral" />
          </div>
        </section>

        {/* Authoring loop diagram */}
        <section>
          <SectionTitle
            title="Authoring loop"
            description="From a standalone application's OpenAPI surface to an Atlas-routable assistant. Every box is a screen in this OneAdmin."
          />
          <div className="mt-3 card p-5">
            <FlowDiagram
              steps={[
                { id: 'catalog',    label: 'OpenAPI Catalog',  hint: 'Product → Module → Endpoint',    Icon: Library,      tone: 'brand'   },
                { id: 'builder',    label: 'API Tool Builder', hint: 'Tool name, description, params', Icon: Wrench,       tone: 'neutral' },
                { id: 'playground', label: 'Playground',       hint: 'HTTP + LLM test before publish', Icon: FlaskConical, tone: 'neutral' },
                { id: 'registry',   label: 'Tool Registry',    hint: 'Versioned, governed catalog',    Icon: Boxes,        tone: 'neutral' },
                { id: 'agents',     label: 'Agent Builder',    hint: 'Agent Framework single / wf',    Icon: Bot,          tone: 'neutral' },
                { id: 'publish',    label: 'Publish',          hint: 'Permissions + policy bound',     Icon: Send,         tone: 'neutral' },
                { id: 'gateway',    label: 'AI Gateway',       hint: 'Product-side runtime plane',     Icon: Network,      tone: 'neutral' },
                { id: 'atlas',      label: 'Atlas',            hint: 'Routes assistantId → product',   Icon: Zap,          tone: 'success' },
              ]}
            />
            <div className="mt-4 grid gap-3 text-xs text-slate-600 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-semibold text-slate-800">Engine.</span>{' '}
                Built on the Microsoft Agent Framework. Single agents and multi-step workflows compose the same way DevUI visualizes them.
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-semibold text-slate-800">Vector data.</span>{' '}
                Knowledge sources sit behind <span className="font-mono">Microsoft.Extensions.VectorData</span>. Qdrant for platform-scale, pgvector per product or local.
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="font-semibold text-slate-800">Routing.</span>{' '}
                Atlas already has a top-level assistant router. The AI Gateway here is the <em>product-side</em> runtime — receives the routed message, picks an agent, executes tools.
              </div>
            </div>
          </div>
        </section>

        {/* Recent executions + audit */}
        <section className="grid gap-6 xl:grid-cols-3">
          <div className="card xl:col-span-2">
            <div className="card-header flex items-center justify-between">
              <span>Recent executions</span>
              <Link to="/executions" className="text-xs font-medium text-brand-700 hover:text-brand-900">View all →</Link>
            </div>
            <ul className="divide-y divide-slate-100">
              {executions.data?.slice(0, 5).map(e => (
                <li key={e.id}>
                  <Link to={`/executions/${e.id}`} className="row-hover flex items-start gap-3 px-5 py-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Badge tone="brand" mono>{e.agentName}</Badge>
                        <ExecutionStatusBadge status={e.status} />
                        <span className="font-mono">{e.model}</span>
                        <span>·</span>
                        <span>{e.latencyMs} ms</span>
                        <span>·</span>
                        <span>{e.tools.length} tool call{e.tools.length === 1 ? '' : 's'}</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-900 line-clamp-1">{e.userMessage}</div>
                      <div className="mt-0.5 text-xs text-slate-500 line-clamp-1">{e.agentResponse}</div>
                    </div>
                    <div className="text-right text-[11px] text-slate-400">
                      <div>{new Date(e.timestamp).toLocaleTimeString()}</div>
                      <div className="font-mono">trace {e.traceId.slice(0, 8)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <div className="card-header flex items-center justify-between">
              <span>Live gateway routing</span>
              <Link to="/gateway" className="text-xs font-medium text-brand-700 hover:text-brand-900">View gateway →</Link>
            </div>
            <ul className="divide-y divide-slate-100">
              {invocations.data?.slice(0, 6).map(i => (
                <li key={i.id} className="px-5 py-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{i.assistantId}</span>
                    <span className="text-slate-400">{new Date(i.receivedAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="mt-0.5 text-slate-500">
                    → <span className="font-mono text-slate-700">{i.resolvedAgentName}</span>
                    <span className="ml-1 text-slate-400">({i.routerReason})</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Audit + risk surfaces */}
        <section className="grid gap-6 xl:grid-cols-2">
          <div className="card">
            <div className="card-header flex items-center gap-2">
              <ListChecks size={14} /> Recent audit events
            </div>
            <ul className="divide-y divide-slate-100">
              {audits.data?.slice(0, 6).map(a => (
                <li key={a.id} className="px-5 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone="info" mono>{a.action}</Badge>
                    <span className="text-xs text-slate-400">{new Date(a.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-slate-800">
                    <span className="font-medium">{a.actor}</span>{' '}
                    <span className="text-slate-500">({a.actorRole})</span>{' '}
                    on <span className="font-mono">{a.targetName}</span>
                  </div>
                  <div className="text-xs text-slate-500">{a.description}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <div className="card-header flex items-center gap-2">
              <AlertTriangle size={14} /> Things that need attention
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              <li className="px-5 py-3">
                <div className="font-medium text-slate-900">2 tools waiting on review</div>
                <div className="text-xs text-slate-500">
                  <span className="font-mono">create_draft_campaign</span> and <span className="font-mono">send_campaign</span> are flagged
                  <em> writeSafety=destructive</em> and require human approval before publish.
                </div>
                <Link to="/registry?filter=InReview" className="mt-1 inline-block text-xs font-medium text-brand-700 hover:text-brand-900">
                  Open review queue →
                </Link>
              </li>
              <li className="px-5 py-3">
                <div className="font-medium text-slate-900">1 knowledge source stale</div>
                <div className="text-xs text-slate-500">
                  <span className="font-mono">People Handbook</span> hasn't been re-indexed in 24 days. The PeopleAssistAgent may be returning stale policy answers.
                </div>
                <Link to="/knowledge/kn_hr_handbook" className="mt-1 inline-block text-xs font-medium text-brand-700 hover:text-brand-900">
                  Re-index now →
                </Link>
              </li>
              <li className="px-5 py-3">
                <div className="font-medium text-slate-900">1 assistant disabled</div>
                <div className="text-xs text-slate-500">
                  <span className="font-mono">people_assistant</span> is registered with the gateway but disabled. Atlas will return 409 for that assistantId.
                </div>
                <Link to="/gateway" className="mt-1 inline-block text-xs font-medium text-brand-700 hover:text-brand-900">
                  Open gateway →
                </Link>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
