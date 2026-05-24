import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, CheckCircle2, Send, ShieldAlert, ShieldCheck, Wrench } from 'lucide-react';
import EmptyState from '../../../components/EmptyState';
import Badge from '../../../components/Badge';
import { ToolStatusBadge } from '../../../components/StatusBadge';
import { toolsApi } from '../../../services/api';
import type { Endpoint, RegistryTool } from '../../../data/types';

interface Props {
  endpoint: Endpoint;
  tool: RegistryTool | undefined;
  hasConfiguration: boolean;
  onConfigureAsTool: () => void;
  onPublished: () => void;
}

export default function PublishTab({ endpoint, tool, hasConfiguration, onConfigureAsTool, onPublished }: Props) {
  const qc = useQueryClient();
  const config = useQuery({
    queryKey: ['config', endpoint.id],
    queryFn: () => toolsApi.getOrCreateConfiguration(endpoint.id),
    enabled: hasConfiguration,
  });

  if (!hasConfiguration) {
    return (
      <EmptyState
        Icon={Wrench}
        title="No tool to publish yet"
        description="Publishing promotes the ToolDefinition for this endpoint into the Tool & Agent Registry, where agents can attach it. Start by configuring the tool first."
        action={
          <button className="btn" onClick={onConfigureAsTool}>
            <Wrench size={14} /> Configure as Tool <ArrowRight size={14} />
          </button>
        }
      />
    );
  }

  const publish = useMutation({
    mutationFn: () => toolsApi.publishConfiguration(endpoint.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tools'] });
      qc.invalidateQueries({ queryKey: ['endpoint.tool', endpoint.id] });
      qc.invalidateQueries({ queryKey: ['endpoint.draft', endpoint.id] });
      qc.invalidateQueries({ queryKey: ['config', endpoint.id] });
      onPublished();
    },
  });

  const setStatus = useMutation({
    mutationFn: (status: 'Published' | 'Deprecated' | 'InReview') =>
      toolsApi.setStatus(tool!.id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tools'] });
      qc.invalidateQueries({ queryKey: ['endpoint.tool', endpoint.id] });
    },
  });

  const readiness = computeReadiness(endpoint, config.data, tool);
  const mvpWriteBlock = endpoint.method !== 'GET';
  const seedBlock = !!endpoint.isSeed;
  const publishDisabled = publish.isPending || readiness.passing < readiness.checks.length || mvpWriteBlock || seedBlock;

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="xl:col-span-2 space-y-6">
        <div className="rounded-md border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-brand-900">
          <div className="flex items-start gap-2">
            <Send size={16} className="mt-0.5 shrink-0 text-brand-700" />
            <div>
              <div className="font-medium">Publishing moves this tool into the Tool &amp; Agent Registry</div>
              <div className="mt-1 text-xs">
                Once published, agents in the Agents page can attach this tool through the <strong>Attach tools</strong> picker.
                Re-publishing bumps the registry version and the change shows up in the audit feed.
              </div>
            </div>
          </div>
        </div>

        {(mvpWriteBlock || seedBlock) && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-700" />
              <div>
                <div className="font-medium">
                  {seedBlock
                    ? 'Sample endpoint — publishing is disabled until a real OpenAPI source is registered.'
                    : `${endpoint.method} tools require human approval — publishing is disabled in the MVP.`}
                </div>
                <div className="mt-1 text-xs">
                  {seedBlock
                    ? 'Register a real OpenAPI source on the OpenAPI Sources page to publish tools backed by live endpoints.'
                    : 'The pre-publish checks below still apply; once approval gating ships, the same flow will require an approver before this tool can be registered as Published.'}
                </div>
              </div>
            </div>
          </div>
        )}

        <section className="card">
          <div className="card-header flex items-center justify-between">
            <span>Pre-publish checks</span>
            <Badge tone={readiness.passing === readiness.checks.length ? 'success' : 'warning'}>
              {readiness.passing} / {readiness.checks.length} passing
            </Badge>
          </div>
          <ul className="divide-y divide-slate-100">
            {readiness.checks.map(c => (
              <li key={c.label} className="flex items-start gap-3 px-5 py-3 text-sm">
                {c.ok
                  ? <CheckCircle2 size={16} className="mt-0.5 text-emerald-600" />
                  : <AlertCircle size={16} className="mt-0.5 text-amber-600" />}
                <div>
                  <div className="font-medium text-slate-800">{c.label}</div>
                  <div className="text-xs text-slate-500">{c.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="card-header flex items-center gap-2">
            <ShieldCheck size={14} /> Governance checklist
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            <li className="flex items-center justify-between px-5 py-3">
              <span>Write safety</span>
              <Badge tone={endpoint.writeSafety === 'destructive' ? 'danger' : endpoint.writeSafety === 'write' ? 'warning' : 'info'}>
                {endpoint.writeSafety}
              </Badge>
            </li>
            <li className="flex items-center justify-between px-5 py-3">
              <span>PII flagged in OpenAPI</span>
              {endpoint.xStMetadata.pii ? <Badge tone="warning">yes</Badge> : <Badge tone="neutral">no</Badge>}
            </li>
            <li className="flex items-center justify-between px-5 py-3">
              <span>Approval required</span>
              {config.data?.permissions.requiresApproval ? <Badge tone="warning">yes</Badge> : <Badge tone="neutral">no</Badge>}
            </li>
            <li className="flex items-center justify-between px-5 py-3">
              <span>PII redaction at retrieval</span>
              {config.data?.policy.redactPii ? <Badge tone="success">on</Badge> : <Badge tone="neutral">off</Badge>}
            </li>
            <li className="flex items-center justify-between px-5 py-3">
              <span>Audit recording</span>
              {config.data?.policy.recordToAudit ? <Badge tone="success">on</Badge> : <Badge tone="danger">off</Badge>}
            </li>
          </ul>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="card p-5">
          <div className="section-title">Current state</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Status</span>
              {tool ? <ToolStatusBadge status={tool.status} /> : <Badge tone="neutral">unregistered</Badge>}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Tool name</span>
              <span className="font-mono text-slate-800">{config.data?.toolName ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Version</span>
              <span className="font-mono text-slate-800">{tool?.version ?? '1.0.0 (next)'}</span>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <div className="section-title">Actions</div>
          <div className="mt-3 space-y-2">
            <button
              className="btn w-full justify-center"
              onClick={() => publish.mutate()}
              disabled={publishDisabled}
              title={
                seedBlock
                  ? 'Disabled: register an OpenAPI source to publish a real tool.'
                  : mvpWriteBlock
                  ? `Disabled in MVP: ${endpoint.method} tools require human approval.`
                  : undefined
              }
            >
              <Send size={14} /> {publish.isPending ? 'Publishing…' : tool ? 'Re-publish' : 'Publish to Registry'}
            </button>
            {tool && tool.status === 'Published' && (
              <button
                className="btn-ghost w-full justify-center"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate('Deprecated')}
              >
                Deprecate tool
              </button>
            )}
            {tool && tool.status === 'InReview' && (
              <button
                className="btn-ghost w-full justify-center"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate('Published')}
              >
                Approve & publish
              </button>
            )}
            <p className="text-xs text-slate-500">
              Publishing puts the tool on the AI Gateway's allowlist for any agent that includes it in its tool set, subject to the configured permissions and policy.
            </p>
          </div>
        </section>
      </aside>
    </div>
  );
}

interface ReadinessCheck {
  label: string;
  detail: string;
  ok: boolean;
}

function computeReadiness(endpoint: Endpoint, config: NonNullable<ReturnType<typeof toolsApi.getOrCreateConfiguration> extends Promise<infer T> ? T : never> | undefined, tool: RegistryTool | undefined) {
  const checks: ReadinessCheck[] = [];
  if (!config) {
    checks.push({ label: 'Configuration loaded', detail: 'Waiting on configuration…', ok: false });
    return { checks, passing: 0 };
  }
  checks.push({ label: 'Tool name is snake_case and unique', detail: `Configured: ${config.toolName}`, ok: /^[a-z][a-z0-9_]*$/.test(config.toolName) });
  checks.push({
    label: 'Tool description is at least 40 characters',
    detail: 'Long enough to give the LLM context about when to call this tool.',
    ok: config.toolDescription.trim().length >= 40,
  });
  checks.push({
    label: 'All required parameters have defaults or will be provided by the LLM',
    detail: 'Required path / header parameters should be either pinned (gateway-provided) or example-able.',
    ok: endpoint.parameters
      .filter(p => p.required)
      .every(p => (config.parameterDefaults[p.name] ?? '').length > 0 || !p.required),
  });
  checks.push({
    label: 'Permissions reviewed',
    detail: 'At least one role allow-listed, or an explicit "*" tenant. We do not allow publishing with no role gating.',
    ok: config.permissions.allowedRoles.length > 0,
  });
  if (endpoint.writeSafety === 'destructive') {
    checks.push({
      label: 'Destructive endpoint requires approval',
      detail: 'Policy pol_destructive_approval forces requiresApproval=true for any destructive write.',
      ok: config.permissions.requiresApproval,
    });
  }
  if (endpoint.xStMetadata.pii) {
    checks.push({
      label: 'PII redaction enabled',
      detail: 'Endpoint is flagged PII in the OpenAPI x- extensions; redaction must be on.',
      ok: config.policy.redactPii,
    });
  }
  void tool;
  const passing = checks.filter(c => c.ok).length;
  return { checks, passing };
}
