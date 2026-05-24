import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  CornerDownRight,
  Database,
  Filter,
  Gauge,
  HandCoins,
  PackageCheck,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Timer,
  TrendingDown,
  UserCheck,
  Wrench,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import BreakdownList from '../components/BreakdownList';
import { api, platformUrls, type ExecutionEventDto } from '../lib/platform';
import type { ExecutionEvent, ExecutionEventStatus } from '../data/runtimeEvents';
import {
  blockedByPolicyReason,
  buildGovernanceSummary,
  buildSummary,
  costByModel,
  failuresByReason,
  modelUsage,
  recentExecutions,
  requestsByAgent,
  requestsByTenant,
  tokensByModel,
  toolCallsByEndpoint,
  toolCallsByTool,
  topTenants,
  topToolEndpoints,
} from '../data/runtimeMetrics';

const fmtTokens = (n: number) => n.toLocaleString();
const fmtUsd    = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const fmtMs     = (n: number) => `${Math.round(n).toLocaleString()} ms`;
const fmtPct    = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtTime   = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const statusPill: Record<ExecutionEventStatus, string> = {
  succeeded: 'bg-emerald-100 text-emerald-800',
  failed:    'bg-rose-100 text-rose-800',
  blocked:   'bg-violet-100 text-violet-800',
};

/**
 * Maps the AI Gateway's wire DTO into the in-memory ExecutionEvent shape the aggregation
 * functions expect. The DTO and the in-memory type are intentionally close so this mapper
 * stays trivial — the only meaningful job is normalising the `userId` field (DTO uses
 * `null`/`undefined`, the in-memory type expects a string) and providing a default
 * `blockedReason` cast.
 */
function dtoToEvent(dto: ExecutionEventDto): ExecutionEvent {
  return {
    executionId: dto.executionId,
    timestamp: dto.timestamp,
    tenantId: dto.tenantId,
    userId: dto.userId ?? '(anonymous)',
    application: dto.application,
    assistantId: dto.assistantId,
    agentId: dto.agentId,
    model: dto.model,
    inputTokens: dto.inputTokens,
    outputTokens: dto.outputTokens,
    estimatedCost: dto.estimatedCost,
    latencyMs: dto.latencyMs,
    status: dto.status,
    toolCalls: dto.toolCalls.map(tc => ({
      toolName: tc.toolName,
      sourceMethod: tc.sourceMethod,
      sourcePath: tc.sourcePath,
      latencyMs: tc.latencyMs,
      status: tc.status,
    })),
    policy: {
      permissionResult: dto.policy.permissionResult,
      sensitiveFieldsFiltered: dto.policy.sensitiveFieldsFiltered,
      approvalRequired: dto.policy.approvalRequired,
      blockedReason: (dto.policy.blockedReason ?? undefined) as ExecutionEvent['policy']['blockedReason'],
    },
  };
}

/**
 * AI Runtime Dashboard.
 *
 * Reads execution events from the AI Gateway's `/telemetry/events` feed (backed by the
 * Postgres `execution_events` / `execution_tool_calls` tables) and renders usage, cost,
 * reliability, and governance views. Refetches every 10 seconds for a live feel.
 *
 * Six questions this page is designed to answer at a glance:
 *   1. Who is using AI?              -> Requests by tenant + Top tenants table
 *   2. Which tenants use it most?    -> Top tenants table
 *   3. Which tools/endpoints?        -> Tool calls by tool / endpoint + Top tools table
 *   4. Which models cost the most?   -> Cost by model + Model usage table
 *   5. Where are failures/blocks?    -> Failures by reason + Blocked by policy reason
 *   6. Are policies protecting us?   -> Governance summary
 */
export default function DashboardPage() {
  // Live feed from the AI Gateway's Postgres-backed telemetry store. We keep the
  // previous result on screen during refetch so the dashboard does not flicker.
  const eventsQuery = useQuery({
    queryKey: ['runtime-telemetry-events'],
    queryFn: () => api.listExecutionEvents(200),
    refetchInterval: 10_000,
    placeholderData: prev => prev,
    retry: 1,
  });

  const events: ExecutionEvent[] = useMemo(
    () => (eventsQuery.data ?? []).map(dtoToEvent),
    [eventsQuery.data],
  );

  const gatewayConfigured = !!platformUrls.aiGateway();
  const isLoadingFirstTime = eventsQuery.isPending && !eventsQuery.data;
  const hasError = !!eventsQuery.error;
  const isEmpty = !isLoadingFirstTime && !hasError && events.length === 0;

  const summary       = useMemo(() => buildSummary(events),             [events]);
  const byTenant      = useMemo(() => requestsByTenant(events),         [events]);
  const byAgent       = useMemo(() => requestsByAgent(events),          [events]);
  const byTool        = useMemo(() => toolCallsByTool(events),          [events]);
  const byEndpoint    = useMemo(() => toolCallsByEndpoint(events),      [events]);
  const tokens        = useMemo(() => tokensByModel(events),            [events]);
  const cost          = useMemo(() => costByModel(events),              [events]);
  const failures      = useMemo(() => failuresByReason(events),         [events]);
  const blocked       = useMemo(() => blockedByPolicyReason(events),    [events]);
  const tenantRows    = useMemo(() => topTenants(events),               [events]);
  const toolRows      = useMemo(() => topToolEndpoints(events),         [events]);
  const modelRows     = useMemo(() => modelUsage(events),               [events]);
  const recent        = useMemo(() => recentExecutions(events),         [events]);
  const governance    = useMemo(() => buildGovernanceSummary(events),   [events]);

  return (
    <>
      <PageHeader
        title="AI Runtime Dashboard"
        subtitle="Live usage, cost, reliability, and governance for the AI Tooling Platform. Aggregated from execution events emitted by the AI Gateway."
        actions={
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <Database size={14} className="text-brand-600" />
            <span>
              Source:{' '}
              <span className="font-mono text-slate-700">
                {gatewayConfigured ? 'ai-gateway / Postgres' : 'gateway URL not resolved'}
              </span>
            </span>
            {eventsQuery.isFetching && <span className="text-brand-700">updating…</span>}
          </span>
        }
      />
      <div className="space-y-6 p-8">
        {/* Banner: live state of the feed. Hidden on the happy path so the demo is clean. */}
        {(isLoadingFirstTime || hasError || isEmpty) && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              hasError
                ? 'border-rose-200 bg-rose-50 text-rose-900'
                : isEmpty
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-brand-100 bg-brand-50/40 text-brand-900'
            }`}
          >
            {isLoadingFirstTime && (
              <p>Loading execution events from the AI Gateway…</p>
            )}
            {hasError && (
              <>
                <p className="font-medium">Could not reach the AI Gateway telemetry feed.</p>
                <p className="mt-1 text-xs">
                  Detail: <span className="font-mono">{(eventsQuery.error as Error).message}</span>
                </p>
              </>
            )}
            {isEmpty && (
              <>
                <p className="font-medium">No execution events captured yet.</p>
                <p className="mt-1 text-xs">
                  Run an interaction through the AI Gateway (Atlas demo client, DevUI, or
                  <span className="font-mono"> POST /assistant/api/interaction/message</span>) — every call
                  inserts one row into <span className="font-mono">execution_events</span> with model + token usage.
                </p>
              </>
            )}
          </div>
        )}

        {/* Top metric cards */}
        <section>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <MetricCard
              label="Requests today"
              value={summary.requestsToday.toLocaleString()}
              hint={`${summary.successCount} ok · ${summary.failedCount} failed · ${summary.blockedCount} blocked`}
              icon={Gauge}
            />
            <MetricCard
              label="Success rate"
              value={fmtPct(summary.successRate)}
              hint={`${summary.successCount} of ${summary.requestsToday}`}
              icon={CheckCircle2}
              tone={summary.successRate >= 0.95 ? 'good' : summary.successRate >= 0.85 ? 'warn' : 'danger'}
            />
            <MetricCard
              label="Average latency"
              value={fmtMs(summary.avgLatencyMs)}
              hint="end-to-end, today"
              icon={Timer}
            />
            <MetricCard
              label="Input tokens"
              value={fmtTokens(summary.inputTokens)}
              hint="prompt + context"
              icon={CornerDownRight}
            />
            <MetricCard
              label="Output tokens"
              value={fmtTokens(summary.outputTokens)}
              hint="model completions"
              icon={PackageCheck}
            />
            <MetricCard
              label="Estimated cost"
              value={fmtUsd(summary.estimatedCost)}
              hint="today, model + tools"
              icon={Banknote}
            />
            <MetricCard
              label="Tool calls"
              value={summary.toolCallCount.toLocaleString()}
              hint={`across ${summary.requestsToday} requests`}
              icon={Wrench}
            />
            <MetricCard
              label="Blocked policy checks"
              value={summary.blockedPolicyChecks.toLocaleString()}
              hint="denied at the gateway"
              icon={ShieldAlert}
              tone={summary.blockedPolicyChecks > 0 ? 'warn' : 'default'}
            />
            <MetricCard
              label="Sensitive fields filtered"
              value={summary.sensitiveFieldsFiltered.toLocaleString()}
              hint="redacted before model"
              icon={ShieldCheck}
              tone={summary.sensitiveFieldsFiltered > 0 ? 'good' : 'default'}
            />
          </div>
        </section>

        {/* Usage breakdowns */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Usage breakdowns</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <BreakdownList
              title="Requests by tenant"
              subtitle="Who is using AI?"
              rows={byTenant}
            />
            <BreakdownList
              title="Requests by agent"
              subtitle="Which agents do the work?"
              rows={byAgent}
            />
            <BreakdownList
              title="Tool calls by tool"
              subtitle="Most-called governed tools."
              rows={byTool}
            />
            <BreakdownList
              title="Tool calls by endpoint"
              subtitle="Source-of-truth API surface."
              rows={byEndpoint}
            />
            <BreakdownList
              title="Token usage by model"
              subtitle="Input + output combined."
              rows={tokens}
              format={fmtTokens}
            />
            <BreakdownList
              title="Estimated cost by model"
              subtitle="Where the budget goes."
              rows={cost}
              format={fmtUsd}
            />
          </div>
        </section>

        {/* Failures / blocked */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Reliability &amp; policy</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <BreakdownList
              title="Failures by reason"
              subtitle="Tool errors vs LLM-side failures."
              rows={failures}
              emptyLabel="No failures recorded."
            />
            <BreakdownList
              title="Blocked calls by policy reason"
              subtitle="Why the gateway said no."
              rows={blocked}
              emptyLabel="No calls blocked."
            />
          </div>
        </section>

        {/* Top tenants table */}
        <section className="card">
          <div className="card-header flex items-center gap-2">
            <UserCheck size={14} /> Top tenants
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2 text-left">Tenant</th>
                  <th className="px-5 py-2 text-right">Requests</th>
                  <th className="px-5 py-2 text-right">Tool calls</th>
                  <th className="px-5 py-2 text-right">Tokens</th>
                  <th className="px-5 py-2 text-right">Estimated cost</th>
                  <th className="px-5 py-2 text-right">Errors</th>
                  <th className="px-5 py-2 text-right">Avg latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenantRows.map(r => (
                  <tr key={r.tenantId} className="hover:bg-slate-50">
                    <td className="px-5 py-2 font-mono">{r.tenantId}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{r.requests.toLocaleString()}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{r.toolCalls.toLocaleString()}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{r.tokens.toLocaleString()}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{fmtUsd(r.estimatedCost)}</td>
                    <td className={`px-5 py-2 text-right tabular-nums ${r.errors > 0 ? 'text-rose-700' : 'text-slate-500'}`}>{r.errors}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{fmtMs(r.avgLatencyMs)}</td>
                  </tr>
                ))}
                {tenantRows.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-4 text-center text-sm text-slate-500">No tenant activity yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Top tools / endpoints table */}
        <section className="card">
          <div className="card-header flex items-center gap-2">
            <Wrench size={14} /> Top tools / endpoints
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2 text-left">Tool</th>
                  <th className="px-5 py-2 text-left">Source endpoint</th>
                  <th className="px-5 py-2 text-right">Calls</th>
                  <th className="px-5 py-2 text-right">Error rate</th>
                  <th className="px-5 py-2 text-right">Avg latency</th>
                  <th className="px-5 py-2 text-right">Last used</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {toolRows.map(r => (
                  <tr key={`${r.toolName}-${r.sourceMethod}-${r.sourcePath}`} className="hover:bg-slate-50">
                    <td className="px-5 py-2 font-mono text-slate-900">{r.toolName}</td>
                    <td className="px-5 py-2">
                      <span className="pill bg-slate-100 text-slate-700 font-mono mr-1">{r.sourceMethod}</span>
                      <span className="font-mono text-xs text-slate-600">{r.sourcePath}</span>
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums">{r.calls.toLocaleString()}</td>
                    <td className={`px-5 py-2 text-right tabular-nums ${r.errorRate > 0 ? 'text-rose-700' : 'text-slate-500'}`}>{fmtPct(r.errorRate)}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{fmtMs(r.avgLatencyMs)}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-slate-500">{fmtTime(r.lastUsed)}</td>
                  </tr>
                ))}
                {toolRows.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-4 text-center text-sm text-slate-500">No tool calls yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Model usage table */}
        <section className="card">
          <div className="card-header flex items-center gap-2">
            <HandCoins size={14} /> Model usage
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2 text-left">Model</th>
                  <th className="px-5 py-2 text-right">Requests</th>
                  <th className="px-5 py-2 text-right">Input tokens</th>
                  <th className="px-5 py-2 text-right">Output tokens</th>
                  <th className="px-5 py-2 text-right">Estimated cost</th>
                  <th className="px-5 py-2 text-right">Avg latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {modelRows.map(r => (
                  <tr key={r.model} className="hover:bg-slate-50">
                    <td className="px-5 py-2 font-mono">{r.model}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{r.requests.toLocaleString()}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{r.inputTokens.toLocaleString()}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{r.outputTokens.toLocaleString()}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{fmtUsd(r.estimatedCost)}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{fmtMs(r.avgLatencyMs)}</td>
                  </tr>
                ))}
                {modelRows.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-4 text-center text-sm text-slate-500">No model usage yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent executions */}
        <section className="card">
          <div className="card-header flex items-center justify-between">
            <span className="flex items-center gap-2"><Clock size={14} /> Recent executions</span>
            <Link to="/activity" className="text-xs font-medium text-brand-700 hover:text-brand-900">View full activity log →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-2 text-left">Time</th>
                  <th className="px-5 py-2 text-left">Tenant</th>
                  <th className="px-5 py-2 text-left">Agent</th>
                  <th className="px-5 py-2 text-left">Assistant</th>
                  <th className="px-5 py-2 text-left">Tools used</th>
                  <th className="px-5 py-2 text-left">Status</th>
                  <th className="px-5 py-2 text-right">Latency</th>
                  <th className="px-5 py-2 text-right">Estimated cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map(r => (
                  <tr key={r.executionId} className="hover:bg-slate-50">
                    <td className="px-5 py-2 whitespace-nowrap text-slate-600">{fmtTime(r.timestamp)}</td>
                    <td className="px-5 py-2 font-mono text-xs">{r.tenantId}</td>
                    <td className="px-5 py-2 font-mono text-xs">{r.agentId}</td>
                    <td className="px-5 py-2 font-mono text-xs">{r.assistantId}</td>
                    <td className="px-5 py-2 text-xs">
                      {r.toolsUsed.length === 0
                        ? <span className="text-slate-400">— none —</span>
                        : (
                          <span className="flex flex-wrap gap-1">
                            {r.toolsUsed.slice(0, 3).map((t, i) => (
                              <span key={i} className="pill bg-slate-100 text-slate-700 font-mono">{t}</span>
                            ))}
                            {r.toolsUsed.length > 3 && (
                              <span className="pill bg-slate-50 text-slate-500">+{r.toolsUsed.length - 3}</span>
                            )}
                          </span>
                        )}
                    </td>
                    <td className="px-5 py-2">
                      <span className={`pill ${statusPill[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums">{fmtMs(r.latencyMs)}</td>
                    <td className="px-5 py-2 text-right tabular-nums">{fmtUsd(r.estimatedCost)}</td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-4 text-center text-sm text-slate-500">No executions captured yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
            Click <Link to="/activity" className="text-brand-700 hover:text-brand-900">Activity</Link> for the full trace view per execution.
          </div>
        </section>

        {/* Governance */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Governance</h2>
          <p className="mb-3 text-xs text-slate-500">
            Are policies protecting us? Counts come from the same execution stream, so every number here corresponds
            to a real allow / deny / approval decision taken by the AI Gateway.
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <MetricCard
              label="Allowed tool calls"
              value={governance.allowedToolCalls.toLocaleString()}
              hint="passed permission + policy"
              icon={ShieldCheck}
              tone="good"
            />
            <MetricCard
              label="Denied tool calls"
              value={governance.deniedToolCalls.toLocaleString()}
              hint="blocked at the gateway"
              icon={ShieldAlert}
              tone={governance.deniedToolCalls > 0 ? 'warn' : 'default'}
            />
            <MetricCard
              label="Approval required"
              value={governance.approvalRequired.toLocaleString()}
              hint="human-in-the-loop gate"
              icon={UserCheck}
            />
            <MetricCard
              label="Sensitive data filtered"
              value={governance.sensitiveDataFiltered.toLocaleString()}
              hint="redacted fields"
              icon={Filter}
              tone={governance.sensitiveDataFiltered > 0 ? 'good' : 'default'}
            />
            <MetricCard
              label="Rate limited"
              value={governance.rateLimited.toLocaleString()}
              hint="throttled requests"
              icon={TrendingDown}
              tone={governance.rateLimited > 0 ? 'warn' : 'default'}
            />
            <MetricCard
              label="Missing permission"
              value={governance.missingPermission.toLocaleString()}
              hint="role not granted"
              icon={AlertTriangle}
              tone={governance.missingPermission > 0 ? 'danger' : 'default'}
            />
            <MetricCard
              label="Tenant mismatch"
              value={governance.tenantMismatch.toLocaleString()}
              hint="cross-tenant attempt"
              icon={Receipt}
              tone={governance.tenantMismatch > 0 ? 'danger' : 'default'}
            />
          </div>
        </section>
      </div>
    </>
  );
}
