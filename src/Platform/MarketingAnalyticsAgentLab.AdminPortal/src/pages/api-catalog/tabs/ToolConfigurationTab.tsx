import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Info, Lock, Save, Send, Wrench } from 'lucide-react';
import clsx from 'clsx';
import Badge from '../../../components/Badge';
import { ToolStatusBadge } from '../../../components/StatusBadge';
import { toolsApi } from '../../../services/api';
import type { Endpoint, ToolConfiguration, ToolDraftState } from '../../../data/types';

interface Props {
  endpoint: Endpoint;
  draftState: ToolDraftState | undefined;
  onTestInPlayground: () => void;
  onPublished: () => void;
}

export default function ToolConfigurationTab({ endpoint, draftState, onTestInPlayground, onPublished }: Props) {
  const qc = useQueryClient();
  const config = useQuery({
    queryKey: ['config', endpoint.id],
    queryFn: () => toolsApi.getOrCreateConfiguration(endpoint.id),
  });
  const [draft, setDraft] = useState<ToolConfiguration | null>(null);

  useEffect(() => {
    if (config.data) setDraft(config.data);
  }, [config.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['config', endpoint.id] });
    qc.invalidateQueries({ queryKey: ['endpoint.tool', endpoint.id] });
    qc.invalidateQueries({ queryKey: ['endpoint.draft', endpoint.id] });
    qc.invalidateQueries({ queryKey: ['tools'] });
  };

  const save = useMutation({
    mutationFn: (cfg: ToolConfiguration) => toolsApi.saveConfiguration(cfg),
    onSuccess: saved => {
      setDraft(saved);
      invalidate();
    },
  });

  const publish = useMutation({
    mutationFn: () => toolsApi.publishConfiguration(endpoint.id),
    onSuccess: () => {
      invalidate();
      onPublished();
    },
  });

  if (!draft) return <p className="text-sm text-slate-500">Loading configuration…</p>;

  const update = (patch: Partial<ToolConfiguration>) => setDraft({ ...draft, ...patch });

  const togglePinned = (paramName: string) => {
    const isPinned = draft.pinnedParameters.includes(paramName);
    update({
      pinnedParameters: isPinned
        ? draft.pinnedParameters.filter(p => p !== paramName)
        : [...draft.pinnedParameters, paramName],
    });
  };

  const isWriteEndpoint = endpoint.method !== 'GET';
  const isSeedEndpoint = !!endpoint.isSeed;
  const isPublished = draftState?.status === 'Published';
  const publishDisabled = publish.isPending || save.isPending || isWriteEndpoint || isSeedEndpoint;

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="xl:col-span-2 space-y-6">
        <section className="card">
          <div className="card-header flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wrench size={14} /> Tool Definition
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              {draftState?.status ? <ToolStatusBadge status={draftState.status} /> : <Badge tone="neutral">draft (unsaved)</Badge>}
              {draftState?.version && <span className="text-slate-500">v{draftState.version}</span>}
            </div>
          </div>
          <div className="space-y-3 p-5">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
                <span>
                  This screen creates or edits the <strong>ToolDefinition</strong> for{' '}
                  <span className="font-mono">{endpoint.method} {endpoint.path}</span>. Save it as a draft, test it in the Playground, then publish to the Tool &amp; Agent Registry where agents can attach it.
                </span>
              </div>
            </div>
            <label className="label">
              Tool name
              <input
                className="input mt-1 font-mono"
                value={draft.toolName}
                onChange={e => update({ toolName: e.target.value.replace(/[^a-z0-9_]/g, '_').toLowerCase() })}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                snake_case · the LLM sees this exact identifier. Pick a name a human would naturally use for the action.
              </p>
            </label>
            <label className="label">
              Tool description
              <textarea
                className="input mt-1 resize-y"
                rows={3}
                value={draft.toolDescription}
                onChange={e => update({ toolDescription: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                One or two sentences. State <em>what the tool returns</em> and <em>when</em> to use it. Tested on the Playground tab.
              </p>
            </label>
          </div>
        </section>

        <section className="card">
          <div className="card-header">Parameter handling</div>
          {endpoint.parameters.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">No parameters.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2 text-left font-medium">Parameter</th>
                  <th className="px-4 py-2 text-left font-medium">Default</th>
                  <th className="px-4 py-2 text-left font-medium">Override</th>
                  <th className="px-4 py-2 text-center font-medium">Pin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {endpoint.parameters.map(p => {
                  const pinned = draft.pinnedParameters.includes(p.name);
                  return (
                    <tr key={`${p.name}-${p.in}`} className={clsx(pinned && 'bg-amber-50/40')}>
                      <td className="px-4 py-2">
                        <div className="font-mono text-slate-800">{p.name}</div>
                        <div className="text-[10px] text-slate-500">{p.in} · {p.type}{p.required ? ' · required' : ''}</div>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="input font-mono"
                          value={draft.parameterDefaults[p.name] ?? ''}
                          onChange={e => update({ parameterDefaults: { ...draft.parameterDefaults, [p.name]: e.target.value } })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          className="input font-mono"
                          value={draft.parameterOverrides[p.name] ?? ''}
                          onChange={e => update({ parameterOverrides: { ...draft.parameterOverrides, [p.name]: e.target.value } })}
                          placeholder="(none)"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => togglePinned(p.name)}
                          title={pinned ? 'Pinned — hidden from LLM and forced to default' : 'Pin to force the default value and hide from the LLM'}
                          className={clsx(
                            'inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px]',
                            pinned ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                          )}
                        >
                          <Lock size={11} /> {pinned ? 'pinned' : 'pin'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        <section className="card">
          <div className="card-header">Permissions</div>
          <div className="space-y-3 p-5 text-sm">
            <label className="label">
              Allowed agents
              <input
                className="input mt-1"
                value={draft.permissions.allowedAgents.join(', ')}
                onChange={e => update({ permissions: { ...draft.permissions, allowedAgents: csv(e.target.value) } })}
                placeholder="MarketingAnalyticsAgent, CampaignOptimizationAgent"
              />
            </label>
            <label className="label">
              Allowed roles
              <input
                className="input mt-1"
                value={draft.permissions.allowedRoles.join(', ')}
                onChange={e => update({ permissions: { ...draft.permissions, allowedRoles: csv(e.target.value) } })}
              />
            </label>
            <label className="label">
              Allowed tenants
              <input
                className="input mt-1"
                value={draft.permissions.allowedTenants.join(', ')}
                onChange={e => update({ permissions: { ...draft.permissions, allowedTenants: csv(e.target.value) } })}
              />
              <p className="mt-1 text-[11px] text-slate-500">Use <code>*</code> for all tenants.</p>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.permissions.requiresApproval}
                onChange={e => update({ permissions: { ...draft.permissions, requiresApproval: e.target.checked } })}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium text-slate-800">Requires human approval per call</div>
                <div className="text-xs text-slate-500">Gateway pauses the execution and waits for an approver before the tool runs.</div>
              </div>
            </label>
          </div>
        </section>

        <section className="card">
          <div className="card-header">Policy</div>
          <div className="space-y-3 p-5 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <label className="label">
                Rate / minute
                <input
                  className="input mt-1"
                  type="number"
                  value={draft.policy.rateLimitPerMinute}
                  onChange={e => update({ policy: { ...draft.policy, rateLimitPerMinute: Number(e.target.value) } })}
                />
              </label>
              <label className="label">
                Rate / hour
                <input
                  className="input mt-1"
                  type="number"
                  value={draft.policy.rateLimitPerHour}
                  onChange={e => update({ policy: { ...draft.policy, rateLimitPerHour: Number(e.target.value) } })}
                />
              </label>
            </div>
            <label className="label">
              Cost center
              <input
                className="input mt-1 font-mono"
                value={draft.policy.costCenter}
                onChange={e => update({ policy: { ...draft.policy, costCenter: e.target.value } })}
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.policy.redactPii}
                onChange={e => update({ policy: { ...draft.policy, redactPii: e.target.checked } })}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium text-slate-800">Redact PII in tool responses</div>
                <div className="text-xs text-slate-500">Strip emails / phone / SSN before the LLM sees the result.</div>
              </div>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.policy.recordToAudit}
                onChange={e => update({ policy: { ...draft.policy, recordToAudit: e.target.checked } })}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium text-slate-800">Record every invocation</div>
                <div className="text-xs text-slate-500">Emit an entry into the Executions / Audit feed.</div>
              </div>
            </label>
          </div>
        </section>

        <section className="card">
          <div className="card-header">Tool actions</div>
          <div className="space-y-2 p-5">
            <button
              type="button"
              className="btn w-full justify-center"
              disabled={save.isPending}
              onClick={() => save.mutate(draft)}
            >
              <Save size={14} /> {save.isPending ? 'Saving…' : isPublished ? 'Save changes (next publish bumps version)' : 'Save Draft Tool'}
            </button>
            <button
              type="button"
              className="btn-ghost w-full justify-center"
              disabled={!draftState?.hasConfiguration || save.isPending}
              onClick={onTestInPlayground}
              title={!draftState?.hasConfiguration ? 'Save the draft first' : undefined}
            >
              <FlaskConical size={14} /> Test in Playground
            </button>
            <button
              type="button"
              className="btn-ghost w-full justify-center"
              disabled={publishDisabled}
              onClick={async () => {
                await save.mutateAsync(draft);
                publish.mutate();
              }}
              title={
                isSeedEndpoint
                  ? 'Sample endpoints cannot be published — register a real OpenAPI source first.'
                  : isWriteEndpoint
                  ? `${endpoint.method} tools require human approval and are disabled in the MVP.`
                  : undefined
              }
            >
              <Send size={14} /> {publish.isPending ? 'Publishing…' : isPublished ? 'Re-publish Tool' : 'Publish Tool'}
            </button>
            {(isSeedEndpoint || isWriteEndpoint) && (
              <p className="text-[11px] text-slate-500">
                {isSeedEndpoint
                  ? 'Sample endpoints are read-only. Register a real OpenAPI source to publish a tool.'
                  : `${endpoint.method} tools require human approval — publishing is disabled in this MVP.`}
              </p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function csv(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean);
}
