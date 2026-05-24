import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bot,
  Brain,
  ChevronRight,
  Database,
  FileJson2,
  GitBranch,
  Info,
  Lock,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserCheck,
  Wrench,
} from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '../../components/PageHeader';
import Tabs, { type TabItem } from '../../components/Tabs';
import Badge from '../../components/Badge';
import EmptyState from '../../components/EmptyState';
import { AgentStatusBadge, ToolStatusBadge, WriteSafetyBadge } from '../../components/StatusBadge';
import { agentsApi, catalogApi, knowledgeApi, openApiSourcesApi, toolsApi } from '../../services/api';
import type { AgentDefinition, AgentStatus, Endpoint, OpenApiSource, RegistryTool } from '../../data/types';
import AttachToolsModal from './AttachToolsModal';

type TabId = 'overview' | 'instructions' | 'tools' | 'knowledge' | 'permissions' | 'workflow';

export default function AgentDetailPage() {
  const { agentId = '' } = useParams();
  const qc = useQueryClient();
  const agentQuery = useQuery({ queryKey: ['agent', agentId], queryFn: () => agentsApi.get(agentId), enabled: !!agentId });

  const [tab, setTab] = useState<TabId>('overview');
  const [draft, setDraft] = useState<AgentDefinition | null>(null);
  useEffect(() => { if (agentQuery.data) setDraft(agentQuery.data); }, [agentQuery.data]);

  const tools = useQuery({ queryKey: ['tools'], queryFn: () => toolsApi.listRegistryTools() });
  const knowledge = useQuery({ queryKey: ['knowledge'], queryFn: () => knowledgeApi.list() });

  const save = useMutation({
    mutationFn: (next: AgentDefinition) => agentsApi.save(next),
    onSuccess: saved => {
      qc.invalidateQueries({ queryKey: ['agent', agentId] });
      qc.invalidateQueries({ queryKey: ['agents'] });
      setDraft(saved);
    },
  });

  const tabs = useMemo<TabItem<TabId>[]>(() => {
    const base: TabItem<TabId>[] = [
      { id: 'overview',     label: 'Overview' },
      { id: 'instructions', label: 'Instructions' },
      { id: 'tools',        label: 'Agent Tools', count: draft?.toolIds.length },
      { id: 'knowledge',    label: 'Knowledge',   count: draft?.knowledgeSourceIds.length },
      { id: 'permissions',  label: 'Permissions' },
    ];
    if (draft?.kind === 'workflow') {
      base.push({ id: 'workflow', label: 'Workflow', count: draft.workflow?.steps.length });
    }
    return base;
  }, [draft]);

  if (!draft) {
    return <div className="p-8 text-sm text-slate-500">Loading agent…</div>;
  }

  return (
    <>
      <PageHeader
        title={draft.displayName}
        subtitle={draft.description}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/agents" className="btn-ghost">
              <ArrowLeft size={14} /> All agents
            </Link>
            <select
              className="input w-36"
              value={draft.status}
              onChange={e => setDraft({ ...draft, status: e.target.value as AgentStatus })}
            >
              <option value="Draft">Draft</option>
              <option value="Published">Published</option>
              <option value="Disabled">Disabled</option>
            </select>
            <button className="btn" disabled={save.isPending} onClick={() => save.mutate(draft)}>
              <Save size={14} /> {save.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      />

      <div className="border-b border-slate-200 bg-white px-8">
        <Tabs tabs={tabs} active={tab} onSelect={setTab} />
      </div>

      <div className="p-8">
        {tab === 'overview'     && <OverviewSection draft={draft} setDraft={setDraft} />}
        {tab === 'instructions' && <InstructionsSection draft={draft} setDraft={setDraft} />}
        {tab === 'tools'        && <ToolsSection draft={draft} setDraft={setDraft} tools={tools.data ?? []} />}
        {tab === 'knowledge'    && <KnowledgeSection draft={draft} setDraft={setDraft} knowledge={knowledge.data ?? []} />}
        {tab === 'permissions'  && <PermissionsSection draft={draft} setDraft={setDraft} />}
        {tab === 'workflow' && draft.kind === 'workflow' && draft.workflow && (
          <WorkflowSection draft={draft} />
        )}
      </div>
    </>
  );
}

// ----------------------------------------------------------------------- Overview

function OverviewSection({ draft, setDraft }: { draft: AgentDefinition; setDraft: (d: AgentDefinition) => void }) {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <section className="card xl:col-span-2">
        <div className="card-header">Identity</div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label className="label">
            Agent name (code)
            <input
              className="input mt-1 font-mono"
              value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value.replace(/[^a-zA-Z0-9]/g, '') })}
            />
          </label>
          <label className="label">
            Display name
            <input className="input mt-1" value={draft.displayName} onChange={e => setDraft({ ...draft, displayName: e.target.value })} />
          </label>
          <label className="md:col-span-2 label">
            Description
            <textarea className="input mt-1" rows={2} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
          </label>
          <label className="label">
            Model
            <select className="input mt-1" value={draft.model} onChange={e => setDraft({ ...draft, model: e.target.value })}>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="o4-mini">o4-mini</option>
              <option value="claude-3-7-sonnet">claude-3-7-sonnet</option>
            </select>
          </label>
          <label className="label">
            Mounted under (Atlas assistant id)
            <input className="input mt-1 font-mono" value={draft.assistantId} onChange={e => setDraft({ ...draft, assistantId: e.target.value })} />
          </label>
          <label className="md:col-span-2 label">
            Routing hints (comma separated) <span className="text-slate-400">— used by the gateway router when this assistant has multiple agents.</span>
            <input
              className="input mt-1"
              value={draft.routingHints.join(', ')}
              onChange={e => setDraft({ ...draft, routingHints: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            />
          </label>
        </div>
      </section>

      <aside className="card p-5">
        <div className="section-title">Agent Framework shape</div>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Kind</span>
            <Badge tone={draft.kind === 'workflow' ? 'purple' : 'brand'}>
              {draft.kind === 'workflow' ? <><GitBranch size={11} /> workflow</> : <><Bot size={11} /> single AIAgent</>}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Status</span>
            <AgentStatusBadge status={draft.status} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Owner</span>
            <span className="text-slate-800">{draft.owner}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Updated</span>
            <span className="text-xs text-slate-700">{new Date(draft.updatedAt).toLocaleString()}</span>
          </div>
        </div>
        <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Single agents are one <span className="font-mono">AIAgent</span> with attached tools.
          Workflows use <span className="font-mono">Microsoft.Agents.AI.Workflows</span> to chain agents,
          tools, and human-approval gates. Both compose with the same <span className="font-mono">AgentRuntime</span>.
        </p>
      </aside>
    </div>
  );
}

// ----------------------------------------------------------------------- Instructions

function InstructionsSection({ draft, setDraft }: { draft: AgentDefinition; setDraft: (d: AgentDefinition) => void }) {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <section className="xl:col-span-2 card">
        <div className="card-header">System instructions</div>
        <div className="p-5">
          <textarea
            className="input min-h-[360px] resize-y font-mono text-xs leading-relaxed"
            value={draft.instructions}
            onChange={e => setDraft({ ...draft, instructions: e.target.value })}
          />
          <p className="mt-2 text-xs text-slate-500">
            These instructions are the agent's system prompt. Operator-authored constraints (e.g. "never call send_campaign with dryRun=false") belong here — that's how write-protection is encoded today.
          </p>
        </div>
      </section>

      <aside className="card p-5 text-xs text-slate-600">
        <div className="section-title">Prompt-writing checklist</div>
        <ul className="mt-3 space-y-2">
          <li>State the agent's <strong>role</strong> in one sentence.</li>
          <li>List the <strong>jobs</strong> it should do — bulleted.</li>
          <li>State <strong>safety rules</strong> explicitly (dry-runs, confirmations, approvals).</li>
          <li>Specify <strong>tone</strong> and <strong>output format</strong>.</li>
          <li>Reference the knowledge source by domain ("use the Marketing Playbooks for…"), not by id.</li>
        </ul>
      </aside>
    </div>
  );
}

// ----------------------------------------------------------------------- Agent Tools

interface ToolsSectionProps {
  draft: AgentDefinition;
  setDraft: (d: AgentDefinition) => void;
  tools: RegistryTool[];
}

function ToolsSection({ draft, setDraft, tools }: ToolsSectionProps) {
  const [showModal, setShowModal] = useState(false);
  const endpoints = useQuery({ queryKey: ['endpoints'], queryFn: () => catalogApi.listEndpoints() });
  const sources = useQuery({ queryKey: ['openapi.sources'], queryFn: () => openApiSourcesApi.list() });

  const endpointById = useMemo(
    () => new Map<string, Endpoint>((endpoints.data ?? []).map(e => [e.id, e])),
    [endpoints.data],
  );
  const sourceById = useMemo(
    () => new Map<string, OpenApiSource>((sources.data ?? []).map(s => [s.id, s])),
    [sources.data],
  );
  const toolById = useMemo(() => new Map(tools.map(t => [t.id, t])), [tools]);

  /**
   * Each attached id is resolved against the live registry so the card always reflects
   * the source of truth. Stale ids (tool removed from registry but still referenced)
   * render as a clear "missing" card with a Detach action — never silently dropped.
   */
  const attached = useMemo(
    () => draft.toolIds.map(id => ({ id, tool: toolById.get(id) })),
    [draft.toolIds, toolById],
  );

  const detach = (id: string) => {
    setDraft({ ...draft, toolIds: draft.toolIds.filter(x => x !== id) });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-brand-900">
        <div className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 shrink-0 text-brand-700" />
          <div>
            <div className="font-medium">Agents do not create tools directly</div>
            <div className="mt-1 max-w-3xl text-xs">
              Tools are created from OpenAPI endpoints in the <Link to="/api-catalog" className="font-medium underline">API Catalog</Link>,
              tested in the <strong>Playground</strong>, published to the <Link to="/registry" className="font-medium underline">Tool &amp; Agent Registry</Link>,
              and then attached to agents here.
            </div>
          </div>
        </div>
        <button className="btn shrink-0" onClick={() => setShowModal(true)}>
          <Plus size={14} /> Attach tools
        </button>
      </div>

      {attached.length === 0 ? (
        <EmptyState
          Icon={Wrench}
          title="No tools attached yet"
          description="Browse the Tool & Agent Registry and attach published tools. The agent's system prompt will see each attached tool's name and description."
          action={
            <button className="btn" onClick={() => setShowModal(true)}>
              <Plus size={14} /> Attach tools
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {attached.map(({ id, tool }) => (
            tool
              ? <AttachedToolCard
                  key={id}
                  tool={tool}
                  endpoint={endpointById.get(tool.endpointId)}
                  source={endpointById.get(tool.endpointId)?.sourceId ? sourceById.get(endpointById.get(tool.endpointId)!.sourceId!) : undefined}
                  onDetach={() => detach(id)}
                />
              : <MissingToolCard key={id} id={id} onDetach={() => detach(id)} />
          ))}
        </div>
      )}

      {showModal && (
        <AttachToolsModal
          alreadyAttachedIds={draft.toolIds}
          onCancel={() => setShowModal(false)}
          onAttach={ids => {
            setDraft({ ...draft, toolIds: ids });
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}

function AttachedToolCard({
  tool,
  endpoint,
  source,
  onDetach,
}: {
  tool: RegistryTool;
  endpoint: Endpoint | undefined;
  source: OpenApiSource | undefined;
  onDetach: () => void;
}) {
  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Wrench size={14} className="mt-0.5 text-brand-600" />
          <div>
            <Link
              to={`/api-catalog/${tool.endpointId}`}
              className="font-mono text-sm font-medium text-slate-900 hover:text-brand-700"
            >
              {tool.toolName}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <ToolStatusBadge status={tool.status} />
              {tool.isSeed ? <Badge tone="warning">Sample</Badge> : <Badge tone="info">Real</Badge>}
              <span className="text-[10px] text-slate-500">v{tool.version}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="text-slate-400 hover:text-rose-600"
          title="Detach from agent"
          onClick={onDetach}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-600 line-clamp-3">{tool.configuration.toolDescription}</p>

      {endpoint && (
        <div className="mt-3 space-y-1.5 text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] font-semibold">{endpoint.method}</span>
            <span className="font-mono text-slate-800 truncate" title={endpoint.path}>{endpoint.path}</span>
            <WriteSafetyBadge writeSafety={endpoint.writeSafety} />
          </div>
          <div className="flex items-center gap-1.5">
            <FileJson2 size={11} className="text-slate-400" />
            <span className="truncate" title={source?.url ?? ''}>
              {source ? source.displayName : 'sample data (no OpenAPI source)'}
            </span>
          </div>
        </div>
      )}

      <div className="mt-3 border-t border-slate-100 pt-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Required permissions</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {tool.configuration.permissions.allowedRoles.length === 0 && (
            <span className="text-[11px] text-slate-400">no role gating</span>
          )}
          {tool.configuration.permissions.allowedRoles.map(role => (
            <Badge key={role} tone="neutral" mono><Lock size={10} /> {role}</Badge>
          ))}
          {tool.configuration.permissions.requiresApproval && (
            <Badge tone="warning">requires approval</Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function MissingToolCard({ id, onDetach }: { id: string; onDetach: () => void }) {
  return (
    <div className="card flex flex-col p-4 border-rose-200">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-rose-800">Missing tool</div>
          <div className="mt-1 font-mono text-[11px] text-rose-700">{id}</div>
        </div>
        <button type="button" className="text-rose-400 hover:text-rose-700" onClick={onDetach} title="Detach">
          <Trash2 size={14} />
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        This tool id is no longer in the Tool &amp; Agent Registry. It was either deprecated or its registration was removed.
        Detach to clean up the agent.
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------- Knowledge

function KnowledgeSection({ draft, setDraft, knowledge }: { draft: AgentDefinition; setDraft: (d: AgentDefinition) => void; knowledge: ReturnType<typeof knowledgeApi.list> extends Promise<infer T> ? T : never }) {
  const toggle = (id: string) => {
    const next = draft.knowledgeSourceIds.includes(id)
      ? draft.knowledgeSourceIds.filter(x => x !== id)
      : [...draft.knowledgeSourceIds, id];
    setDraft({ ...draft, knowledgeSourceIds: next });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <section className="xl:col-span-2 space-y-3">
        {knowledge.map(k => {
          const checked = draft.knowledgeSourceIds.includes(k.id);
          return (
            <label key={k.id} className={clsx('card flex items-start gap-3 p-4', checked && 'ring-1 ring-brand-300')}>
              <input type="checkbox" className="mt-1" checked={checked} onChange={() => toggle(k.id)} />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Database size={14} className="text-slate-400" />
                  <span className="font-medium text-slate-900">{k.displayName}</span>
                  <Badge tone={k.vectorProvider === 'qdrant' ? 'purple' : 'info'}>{k.vectorProvider}</Badge>
                  <span className="text-[11px] text-slate-500">{k.chunkCount.toLocaleString()} chunks · {k.embeddingModel}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{k.description}</div>
              </div>
            </label>
          );
        })}
      </section>

      <aside className="card p-5 text-sm">
        <div className="section-title">Retrieval at runtime</div>
        <p className="mt-3 text-xs text-slate-600">
          At runtime, the AI Gateway performs vector retrieval against each attached knowledge source via the
          <span className="font-mono"> Microsoft.Extensions.VectorData </span>
          <span className="font-mono">VectorStoreCollectionSearch</span> abstraction. The top-K chunks are inlined into the agent's prompt as a "context" block.
        </p>
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div className="font-medium text-slate-800">Provider tradeoff</div>
          <ul className="mt-1 space-y-1">
            <li><span className="font-mono">qdrant</span> — preferred platform default, multi-tenant, payload filters, scale.</li>
            <li><span className="font-mono">pgvector</span> — lightweight per-product or local-dev. Easier ops, smaller scale.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

// ----------------------------------------------------------------------- Permissions

function PermissionsSection({ draft, setDraft }: { draft: AgentDefinition; setDraft: (d: AgentDefinition) => void }) {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <section className="xl:col-span-2 card">
        <div className="card-header">Who can use this agent</div>
        <div className="space-y-3 p-5 text-sm">
          <label className="label">
            Allowed roles
            <input
              className="input mt-1"
              value={draft.permissions.allowedRoles.join(', ')}
              onChange={e => setDraft({ ...draft, permissions: { ...draft.permissions, allowedRoles: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
            />
          </label>
          <label className="label">
            Allowed tenants
            <input
              className="input mt-1"
              value={draft.permissions.allowedTenants.join(', ')}
              onChange={e => setDraft({ ...draft, permissions: { ...draft.permissions, allowedTenants: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })}
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={draft.permissions.requiresApproval}
              onChange={e => setDraft({ ...draft, permissions: { ...draft.permissions, requiresApproval: e.target.checked } })}
            />
            <div>
              <div className="font-medium text-slate-800">Require human approval on every interaction</div>
              <div className="text-xs text-slate-500">
                Use sparingly — appropriate when the agent has write tools that should never run silently.
              </div>
            </div>
          </label>
        </div>
      </section>

      <aside className="card p-5 text-sm text-slate-600">
        <div className="section-title">Layered enforcement</div>
        <ul className="mt-3 space-y-2 text-xs">
          <li className="flex items-start gap-2"><ShieldCheck size={14} className="mt-0.5 text-emerald-600" /> Gateway resolves <strong>caller roles + tenant</strong> before agent selection.</li>
          <li className="flex items-start gap-2"><Wrench size={14} className="mt-0.5 text-amber-600" /> Each <strong>tool</strong> has its own permission set, evaluated again on tool call.</li>
          <li className="flex items-start gap-2"><UserCheck size={14} className="mt-0.5 text-brand-600" /> <strong>Approval gates</strong> pause the workflow on a destructive or sensitive call.</li>
          <li className="flex items-start gap-2"><Brain size={14} className="mt-0.5 text-slate-500" /> Operator-authored <strong>instructions</strong> add a softer guardrail in the system prompt.</li>
        </ul>
      </aside>
    </div>
  );
}

// ----------------------------------------------------------------------- Workflow

function WorkflowSection({ draft }: { draft: AgentDefinition }) {
  const wf = draft.workflow!;
  return (
    <section className="card p-5">
      <div className="section-title">Workflow steps</div>
      <p className="mt-1 text-xs text-slate-500">
        Built on <span className="font-mono">Microsoft.Agents.AI.Workflows</span>. The entry step is{' '}
        <span className="font-mono">{wf.entryStepId}</span>. DevUI visualises this graph identically.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {wf.steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className={clsx(
              'rounded-lg border px-3 py-2 text-xs shadow-sm min-w-[170px]',
              s.kind === 'agent'           && 'border-brand-200 bg-brand-50 text-brand-800',
              s.kind === 'tool'            && 'border-emerald-200 bg-emerald-50 text-emerald-800',
              s.kind === 'human-approval'  && 'border-amber-200 bg-amber-50 text-amber-800',
              s.kind === 'condition'       && 'border-violet-200 bg-violet-50 text-violet-800',
              s.kind === 'parallel'        && 'border-slate-200 bg-slate-50 text-slate-800',
            )}>
              <div className="flex items-center gap-1.5">
                {s.kind === 'agent' ? <Bot size={11} /> : s.kind === 'tool' ? <Wrench size={11} /> : s.kind === 'human-approval' ? <UserCheck size={11} /> : <GitBranch size={11} />}
                <span className="font-semibold uppercase tracking-wider text-[10px]">{s.kind}</span>
              </div>
              <div className="mt-1 text-sm font-medium">{s.name}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-slate-600">{s.description}</div>
            </div>
            {i < wf.steps.length - 1 && <ChevronRight size={16} className="text-slate-300" />}
          </div>
        ))}
      </div>
    </section>
  );
}
