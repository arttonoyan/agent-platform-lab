import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ChevronRight,
  Lock,
  Play,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Tabs, { type TabSpec } from '../components/Tabs';
import CreateToolSetModal, { type CreateToolSetSelection } from '../components/CreateToolSetModal';
import {
  api,
  type ApiOperation,
  type PlaygroundResponse,
  type PluginDefinition,
  type PluginEndpoint,
} from '../lib/platform';
import { classifyService, isWriteMethod } from '../lib/catalog';

type Tab = 'overview' | 'schema' | 'source';

const TABS: TabSpec<Tab>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'schema',   label: 'Schema' },
  { id: 'source',   label: 'Source' },
];

/**
 * Endpoint detail page (simplified, post-IA-refactor).
 *
 * Endpoint detail is now a shallow surface — Overview / Schema / Source. Tool
 * configuration, the LLM playground, and publish lifecycle all live on the parent
 * Tool Set page; endpoint detail just shows the operation, lets the operator test
 * it raw (Test Endpoint - HTTP only, no model), and offers the obvious next steps:
 *
 *   - Create Tool Set from this endpoint
 *   - Open related Tool Set (if one already wraps it)
 *   - Test Endpoint
 */
export default function EndpointDetailPage() {
  const { id = '', operationId = '' } = useParams();
  const decodedOperationId = decodeURIComponent(operationId);

  const specs = useQuery({ queryKey: ['apis'], queryFn: () => api.listApiSpecs() });
  const ops = useQuery({ queryKey: ['ops', id], queryFn: () => api.getApiOperations(id), enabled: !!id });
  const plugins = useQuery({ queryKey: ['plugins', 'all'], queryFn: () => api.listPlugins() });

  const spec = specs.data?.find(s => s.id === id);
  const op: ApiOperation | undefined = ops.data?.find(o => o.operationId === decodedOperationId);

  const owningToolSet = useMemo<PluginDefinition | undefined>(
    () =>
      plugins.data?.find(
        p => p.apiSpecId === id && p.endpoints.some(e => e.operationId === decodedOperationId),
      ),
    [plugins.data, id, decodedOperationId],
  );
  const owningEndpoint = useMemo<PluginEndpoint | undefined>(
    () => owningToolSet?.endpoints.find(e => e.operationId === decodedOperationId),
    [owningToolSet, decodedOperationId],
  );

  const [tab, setTab] = useState<Tab>('overview');
  const [creating, setCreating] = useState<CreateToolSetSelection | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  if (specs.isPending || ops.isPending) {
    return <PageHeader title="Loading endpoint…" />;
  }
  if (!spec || !op) {
    return (
      <>
        <PageHeader title="Endpoint not found" />
        <div className="p-8">
          <p className="text-sm text-slate-600">
            We couldn't find an operation with id <span className="font-mono">{decodedOperationId}</span> in the
            source <span className="mx-1 font-mono">{id}</span>.
          </p>
          <Link className="btn-ghost mt-4" to="/tools?tab=endpoints">← Back to Tools / Endpoints</Link>
        </div>
      </>
    );
  }

  const meta = classifyService(spec.serviceName);
  const write = isWriteMethod(op.method);

  // Capture the narrowed spec + op references so the closures below can use them
  // without re-narrowing — TypeScript doesn't carry the `if (!spec || !op) return`
  // narrowing into nested function bodies otherwise.
  const safeSpec = spec;
  const safeOp = op;

  function openTest() {
    setTestOpen(true);
  }
  function openCreate() {
    setCreating({
      spec: safeSpec,
      endpoints: [
        {
          operationId: safeOp.operationId,
          method: safeOp.method,
          path: safeOp.path,
          summary: safeOp.summary,
        },
      ],
    });
  }

  return (
    <>
      <PageHeader
        title={`${op.method.toUpperCase()} ${op.path}`}
        subtitle={op.summary || op.description}
        actions={
          <div className="flex items-center gap-2">
            <span className={`pill ${write ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {write ? 'Write' : 'Read'}
            </span>
            <span className="pill bg-slate-100 text-slate-600">Imported</span>
            <button
              className="btn-ghost"
              onClick={openTest}
              disabled={!owningToolSet}
              title={
                owningToolSet
                  ? 'Send the raw HTTP request through the Tool Runtime — no model involved'
                  : 'Test Endpoint runs through the Tool Runtime, which today is keyed by a Tool Set. Create a Tool Set first.'
              }
            >
              <Play size={14} /> Test Endpoint
            </button>
            {owningToolSet ? (
              <Link className="btn-ghost" to={`/tools/tool-sets/${owningToolSet.id}`}>
                <Wrench size={14} /> Open related Tool Set
                <ArrowRight size={12} className="ml-1 text-slate-400" />
              </Link>
            ) : (
              <button className="btn" onClick={openCreate}>
                <Wrench size={14} /> Create Tool Set from this endpoint
              </button>
            )}
          </div>
        }
      />

      <div className="px-8 pt-3">
        <Breadcrumbs spec={spec} meta={meta} op={op} />
        <Tabs<Tab> tabs={TABS} active={tab} onChange={setTab} className="mt-3" />
      </div>

      <div className="p-8">
        {tab === 'overview' && (
          <OverviewTab
            op={op}
            spec={spec}
            meta={meta}
            owningToolSet={owningToolSet}
            owningEndpoint={owningEndpoint}
          />
        )}
        {tab === 'schema' && <SchemaTab op={op} />}
        {tab === 'source' && <SourceTab op={op} spec={spec} meta={meta} />}
      </div>

      <CreateToolSetModal
        open={!!creating}
        selection={creating}
        onClose={() => setCreating(null)}
      />

      {owningToolSet && (
        <TestEndpointModal
          open={testOpen}
          onClose={() => setTestOpen(false)}
          op={op}
          toolSetId={owningToolSet.id}
        />
      )}
    </>
  );
}

function Breadcrumbs({
  spec,
  meta,
  op,
}: {
  spec: { id: string; displayName: string };
  meta: { productDisplay: string; moduleDisplay: string };
  op: ApiOperation;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500" aria-label="Breadcrumb">
      <Link to="/tools" className="hover:text-slate-700">Tools</Link>
      <ChevronRight size={12} className="text-slate-300" />
      <Link to="/tools?tab=endpoints" className="hover:text-slate-700">Endpoints</Link>
      <ChevronRight size={12} className="text-slate-300" />
      <span>{meta.productDisplay}</span>
      <ChevronRight size={12} className="text-slate-300" />
      <span>{meta.moduleDisplay}</span>
      <ChevronRight size={12} className="text-slate-300" />
      <Link to={`/tools/sources/${spec.id}`} className="hover:text-slate-700">{spec.displayName}</Link>
      <ChevronRight size={12} className="text-slate-300" />
      <span className="font-mono text-slate-700">{op.operationId}</span>
    </nav>
  );
}

function OverviewTab({
  op,
  spec,
  meta,
  owningToolSet,
  owningEndpoint,
}: {
  op: ApiOperation;
  spec: { id: string; serviceName: string; displayName: string; baseAddress: string; importedAt: string };
  meta: { product: string; productDisplay: string; module: string; moduleDisplay: string; ownerTeam: string };
  owningToolSet?: PluginDefinition;
  owningEndpoint?: PluginEndpoint;
}) {
  const status = !owningToolSet
    ? 'Not configured'
    : owningToolSet.status === 'Published'
    ? 'Published tool'
    : 'Draft tool';
  const statusTone = !owningToolSet
    ? 'bg-slate-100 text-slate-600'
    : owningToolSet.status === 'Published'
    ? 'bg-emerald-100 text-emerald-800'
    : 'bg-amber-100 text-amber-800';

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="card lg:col-span-2">
        <div className="card-header">Description</div>
        <div className="space-y-3 p-5 text-sm text-slate-700">
          <p>{op.description || op.summary || <span className="text-slate-500">(No description provided)</span>}</p>
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <Detail term="OperationId" value={op.operationId} mono />
            <Detail term="HTTP" value={`${op.method.toUpperCase()} ${op.path}`} mono />
            <Detail term="Source API" value={spec.displayName} />
            <Detail term="Product / Module" value={`${meta.productDisplay} / ${meta.moduleDisplay}`} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="card">
          <div className="card-header">Tool status</div>
          <div className="space-y-2 p-5 text-xs">
            <div className="flex items-center gap-2">
              <span className={`pill ${statusTone}`}>{status}</span>
              {owningToolSet && (
                <Link
                  to={`/tools/tool-sets/${owningToolSet.id}`}
                  className="text-brand-700 hover:text-brand-900"
                >
                  {owningToolSet.displayName} →
                </Link>
              )}
            </div>
            {owningEndpoint && <Detail term="Tool name" value={owningEndpoint.toolName} mono />}
            {owningToolSet?.permissions && (
              <Detail
                term="Allowed agents"
                value={
                  owningToolSet.permissions.allowedAgents.length === 0
                    ? '(none specified)'
                    : owningToolSet.permissions.allowedAgents.join(', ')
                }
              />
            )}
            {!owningToolSet && (
              <p className="text-slate-500">
                This endpoint isn't wrapped in a Tool Set yet. Use{' '}
                <strong>Create Tool Set from this endpoint</strong> in the header to start.
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">Source metadata</div>
          <dl className="grid grid-cols-2 gap-2 p-5 text-xs">
            <Detail term="Source" value={spec.displayName} />
            <Detail term="Service" value={spec.serviceName} mono />
            <Detail term="Owner team" value={meta.ownerTeam} />
            <Detail term="Imported" value={new Date(spec.importedAt).toLocaleString()} />
            <Detail term="Base URL" value={spec.baseAddress} mono className="col-span-2" />
          </dl>
        </div>
      </section>
    </div>
  );
}

function SchemaTab({ op }: { op: ApiOperation }) {
  return (
    <div className="space-y-4">
      <section className="card">
        <div className="card-header">Parameters</div>
        {op.parameters.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">This endpoint takes no parameters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-2 text-left">Parameter</th>
                  <th className="px-5 py-2 text-left">In</th>
                  <th className="px-5 py-2 text-left">Type</th>
                  <th className="px-5 py-2 text-left">Required</th>
                  <th className="px-5 py-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {op.parameters.map(p => (
                  <tr key={p.name + p.in}>
                    <td className="px-5 py-2 font-mono">{p.name}</td>
                    <td className="px-5 py-2">{p.in}</td>
                    <td className="px-5 py-2">{p.type}</td>
                    <td className="px-5 py-2">{p.required ? 'yes' : 'no'}</td>
                    <td className="px-5 py-2 text-slate-500">{p.description ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-slate-500">
        Response schemas surface here once the PluginRegistry importer captures the
        <span className="ml-1 font-mono">responseSchemaJson</span> field per operation.
      </p>
    </div>
  );
}

function SourceTab({
  op,
  spec,
  meta,
}: {
  op: ApiOperation;
  spec: { id: string; displayName: string; baseAddress: string; serviceName: string; importedAt: string };
  meta: { productDisplay: string; moduleDisplay: string; ownerTeam: string };
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card p-5">
        <div className="card-header -mx-5 -mt-5 mb-4 px-5">OpenAPI source</div>
        <dl className="grid gap-3 text-xs">
          <Detail term="Source" value={spec.displayName} />
          <Detail term="Service" value={spec.serviceName} mono />
          <Detail term="Base URL" value={spec.baseAddress} mono />
          <Detail term="OpenAPI URL" value={`${spec.baseAddress}/openapi/v1.json`} mono />
          <Detail term="Imported at" value={new Date(spec.importedAt).toLocaleString()} />
          <Detail term="Owner team" value={meta.ownerTeam} />
        </dl>
        <Link className="btn-ghost mt-4" to={`/tools/sources/${spec.id}`}>
          Open source
        </Link>
      </section>

      <section className="card p-5">
        <div className="card-header -mx-5 -mt-5 mb-4 px-5">Path</div>
        <p className="text-xs text-slate-500">
          The exact upstream URL the Tool Runtime invokes when this endpoint is called as part of a
          Tool Set. The platform never lets the browser hit internal APIs directly.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
          {op.method.toUpperCase()} {spec.baseAddress}{op.path}
        </pre>
      </section>
    </div>
  );
}

function Detail({
  term,
  value,
  mono,
  className,
}: {
  term: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{term}</dt>
      <dd className={`mt-0.5 break-all text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

/**
 * "Test Endpoint" modal. Raw HTTP execution only — no model — through the Tool
 * Runtime (so the browser never calls internal APIs directly). Today this is keyed
 * by a Tool Set id; the operator opens it from the header when the endpoint is
 * already wrapped in a Tool Set, otherwise we ask them to create one first.
 *
 * Write methods (POST/PUT/PATCH/DELETE) require an explicit confirm tick before
 * the Run button activates.
 */
function TestEndpointModal({
  open,
  onClose,
  op,
  toolSetId,
}: {
  open: boolean;
  onClose: () => void;
  op: ApiOperation;
  toolSetId: string;
}) {
  const [params, setParams] = useState<Record<string, string>>(
    Object.fromEntries(op.parameters.map(p => [p.name, ''])),
  );
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PlaygroundResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmWrite, setConfirmWrite] = useState(false);
  const write = isWriteMethod(op.method);
  const canRun = !running && (!write || confirmWrite);

  async function run() {
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await api.runPlayground(toolSetId, { operationId: op.operationId, parameters: params });
      setResult(res);
    } catch (ex) {
      setError((ex as Error).message);
    } finally {
      setRunning(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-6">
      <div className="card max-h-[90vh] w-full max-w-3xl overflow-auto">
        <div className="card-header flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Play size={14} className="text-brand-600" /> Test Endpoint
          </span>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="pill bg-slate-100 text-slate-700 font-mono">{op.method.toUpperCase()}</span>
              <span className="font-mono text-slate-700">{op.path}</span>
              {write && (
                <span className="pill bg-violet-100 text-violet-800">
                  <ShieldCheck size={10} className="mr-1 inline" /> Requires approval
                </span>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Sends the raw HTTP request through the server-side Tool Runtime. No model is involved.
            </p>
            {op.parameters.length === 0 && (
              <p className="mt-3 text-xs text-slate-500">This endpoint takes no parameters.</p>
            )}
            {op.parameters.map(p => (
              <label key={p.name} className="mt-3 block text-xs font-medium text-slate-600">
                {p.name}{' '}
                <span className="text-slate-400">({p.in}, {p.type}{p.required ? ', required' : ''})</span>
                <input
                  className="input mt-1"
                  value={params[p.name] ?? ''}
                  onChange={e => setParams({ ...params, [p.name]: e.target.value })}
                  placeholder={p.description ?? ''}
                />
              </label>
            ))}
            {write && (
              <label className="mt-3 flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={confirmWrite}
                  onChange={e => setConfirmWrite(e.target.checked)}
                />
                <span>
                  <Lock size={12} className="mr-1 inline text-amber-600" />
                  I understand this {op.method} request will hit the real upstream API.
                </span>
              </label>
            )}
            <button className="btn mt-4" onClick={run} disabled={!canRun}>
              <Play size={14} /> {running ? 'Running…' : 'Run'}
            </button>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Response</div>
            {error && <p className="mt-1 text-sm text-rose-600 whitespace-pre-wrap">{error}</p>}
            {result && (
              <>
                <div className="mt-1 text-xs text-slate-500">
                  Status <span className="font-mono">{result.statusCode}</span> · {result.durationMs} ms · {result.contentType}
                </div>
                <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs whitespace-pre">
                  {prettyJsonOrText(result.body)}
                </pre>
              </>
            )}
            {!result && !error && (
              <p className="mt-1 text-sm text-slate-500">
                Fill in parameters and click <strong>Run</strong> to send the request.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function prettyJsonOrText(body: string): string {
  const trimmed = body.trimStart();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return body;
  try { return JSON.stringify(JSON.parse(body), null, 2); }
  catch { return body; }
}
