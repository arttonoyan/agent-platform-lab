import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight, ShieldCheck, Wrench } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { api } from '../lib/platform';
import { classifyService, isWriteMethod } from '../lib/catalog';

const HTTP_METHOD_TONE: Record<string, string> = {
  GET:    'bg-emerald-50 text-emerald-700',
  POST:   'bg-amber-50 text-amber-700',
  PUT:    'bg-amber-50 text-amber-700',
  PATCH:  'bg-amber-50 text-amber-700',
  DELETE: 'bg-rose-50 text-rose-700',
};

/**
 * API Source detail. Shows every operation a registered OpenAPI source exposes and
 * lets the operator wrap one or more operations into a Tool Set in a single screen.
 *
 * The Endpoints tab on /tools also offers the same flow (via the
 * CreateToolSetModal), but this page is useful when the operator is browsing the
 * source itself — every operation in context, with one-click multi-select. The
 * ?ops=op1,op2 query param is honoured on first render so deep-links from the
 * Endpoints tab can carry their selection here.
 */
export default function ApiDetailPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const ops = useQuery({ queryKey: ['ops', id], queryFn: () => api.getApiOperations(id) });
  const specs = useQuery({ queryKey: ['apis'], queryFn: () => api.listApiSpecs() });
  const spec = specs.data?.find(s => s.id === id);
  const meta = spec ? classifyService(spec.serviceName) : null;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Honour the ?ops= deep-link once operations have loaded. We don't re-apply on every
  // render because the operator may have deselected something on purpose.
  useEffect(() => {
    if (!ops.data) return;
    const preselect = (params.get('ops') ?? '').split(',').map(s => s.trim()).filter(Boolean);
    if (preselect.length === 0) return;
    setSelected(prev => {
      if (prev.size > 0) return prev;
      const next = new Set<string>();
      for (const opId of preselect) {
        if (ops.data.some(o => o.operationId === opId)) next.add(opId);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ops.data]);

  const create = useMutation({
    mutationFn: () =>
      api.createPlugin({
        name,
        displayName: name,
        description,
        apiSpecId: id,
        operationIds: Array.from(selected),
      }),
    onSuccess: toolSet => nav(`/tools/tool-sets/${toolSet.id}`),
  });

  const canCreate = useMemo(() => name.trim().length > 0 && selected.size > 0, [name, selected]);
  const writeOpsSelected = useMemo(() => {
    if (!ops.data) return 0;
    return Array.from(selected).filter(opId => {
      const op = ops.data.find(o => o.operationId === opId);
      return op ? isWriteMethod(op.method) : false;
    }).length;
  }, [ops.data, selected]);

  return (
    <>
      <PageHeader
        title={spec?.displayName ?? 'API Source'}
        subtitle={spec ? `${spec.baseAddress} · ${spec.operationCount} operations` : 'Loading…'}
        actions={
          spec && (
            <span className="pill bg-slate-100 text-slate-600">
              {meta?.productDisplay} / {meta?.moduleDisplay}
            </span>
          )
        }
      />

      <div className="px-8 pt-3">
        <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link to="/tools" className="hover:text-slate-700">Tools</Link>
          <ChevronRight size={12} className="text-slate-300" />
          <Link to="/tools?tab=sources" className="hover:text-slate-700">API Sources</Link>
          {meta && (
            <>
              <ChevronRight size={12} className="text-slate-300" />
              <span>{meta.productDisplay}</span>
              <ChevronRight size={12} className="text-slate-300" />
              <span>{meta.moduleDisplay}</span>
            </>
          )}
          {spec && (
            <>
              <ChevronRight size={12} className="text-slate-300" />
              <span className="text-slate-700">{spec.displayName}</span>
            </>
          )}
        </nav>
      </div>

      <div className="grid h-[calc(100%-89px)] grid-cols-3 gap-6 overflow-auto p-8">
        <div className="col-span-2 card">
          <div className="card-header flex items-center justify-between">
            <span>Endpoints</span>
            <span className="text-xs font-normal text-slate-500">{selected.size} selected</span>
          </div>
          <div className="divide-y divide-slate-100">
            {ops.data?.map(op => {
              const write = isWriteMethod(op.method);
              const tone = HTTP_METHOD_TONE[op.method.toUpperCase()] ?? 'bg-slate-100 text-slate-700';
              return (
                <label
                  key={op.operationId}
                  className="flex cursor-pointer items-start gap-3 px-5 py-3 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(op.operationId)}
                    onChange={() => {
                      setSelected(prev => {
                        const next = new Set(prev);
                        if (next.has(op.operationId)) next.delete(op.operationId);
                        else next.add(op.operationId);
                        return next;
                      });
                    }}
                  />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`pill font-mono ${tone}`}>{op.method}</span>
                      <Link
                        to={`/tools/sources/${id}/endpoints/${encodeURIComponent(op.operationId)}`}
                        className="font-mono text-sm text-slate-700 hover:text-brand-700"
                      >
                        {op.path}
                      </Link>
                      <span
                        className={`pill ${write ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}
                      >
                        {write ? 'Write' : 'Read'}
                      </span>
                      {write && (
                        <span
                          className="pill bg-violet-100 text-violet-800"
                          title="Write tools require approval at runtime"
                        >
                          <ShieldCheck size={10} className="mr-1 inline" /> Requires approval
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-900">{op.operationId}</div>
                    <div className="mt-1 text-xs text-slate-500">{op.summary || op.description}</div>
                  </div>
                </label>
              );
            })}
            {ops.data?.length === 0 && (
              <p className="px-5 py-3 text-sm text-slate-500">No operations in this source.</p>
            )}
          </div>
        </div>

        <div className="card h-fit">
          <div className="card-header">Create Tool Set from selected endpoints</div>
          <div className="space-y-3 p-5">
            <p className="text-xs text-slate-500">
              Each selected operation becomes one callable AI tool. The Tool Set groups them and owns auth,
              permissions, and publish lifecycle. You can rename each tool on the next page.
            </p>
            <label className="block text-xs font-medium text-slate-600">
              Tool Set name
              <input
                className="input mt-1 font-mono"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="MarketingAnalyticsToolSet"
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Tool Set description
              <textarea
                className="input mt-1"
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Read-only delivery, open-rate, CTR, and per-campaign performance reports."
              />
            </label>
            <div className="text-xs text-slate-500">
              {selected.size} {selected.size === 1 ? 'operation' : 'operations'} selected
              {writeOpsSelected > 0 && (
                <span className="ml-2 text-amber-700">· {writeOpsSelected} write</span>
              )}
            </div>
            <button
              className="btn w-full justify-center"
              disabled={!canCreate || create.isPending}
              onClick={() => create.mutate()}
            >
              <Wrench size={14} /> {create.isPending ? 'Creating…' : 'Create Tool Set'}
            </button>
            {create.error && <p className="text-xs text-rose-600">{(create.error as Error).message}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
