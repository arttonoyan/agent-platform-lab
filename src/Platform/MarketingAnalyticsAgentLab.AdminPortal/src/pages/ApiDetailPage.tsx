import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plug2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { api } from '../lib/platform';

export default function ApiDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const ops = useQuery({ queryKey: ['ops', id], queryFn: () => api.getApiOperations(id) });
  const specs = useQuery({ queryKey: ['apis'], queryFn: () => api.listApiSpecs() });
  const spec = specs.data?.find(s => s.id === id);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.createPlugin({
        name,
        displayName: name,
        description,
        apiSpecId: id,
        operationIds: Array.from(selected),
      }),
    onSuccess: plugin => nav(`/plugins/${plugin.id}`),
  });

  const canCreate = useMemo(() => name.trim().length > 0 && selected.size > 0, [name, selected]);

  return (
    <>
      <PageHeader
        title={spec?.displayName ?? 'API'}
        subtitle={spec ? `${spec.baseAddress} · ${spec.operationCount} operations` : 'Loading...'}
      />
      <div className="grid h-[calc(100%-89px)] grid-cols-3 gap-6 overflow-auto p-8">
        <div className="col-span-2 card">
          <div className="card-header">Operations</div>
          <div className="divide-y divide-slate-100">
            {ops.data?.map(op => (
              <label key={op.operationId} className="flex cursor-pointer items-start gap-3 px-5 py-3 hover:bg-slate-50">
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
                  <div className="flex items-center gap-2">
                    <span className="pill bg-slate-100 text-slate-700 font-mono">{op.method}</span>
                    <span className="font-mono text-sm text-slate-700">{op.path}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{op.operationId}</div>
                  <div className="mt-1 text-xs text-slate-500">{op.summary || op.description}</div>
                </div>
              </label>
            ))}
            {ops.data?.length === 0 && <p className="px-5 py-3 text-sm text-slate-500">No operations in this spec.</p>}
          </div>
        </div>

        <div className="card h-fit">
          <div className="card-header">Create plugin</div>
          <div className="space-y-3 p-5">
            <label className="block text-xs font-medium text-slate-600">
              Plugin name
              <input className="input mt-1" value={name} onChange={e => setName(e.target.value)} placeholder="MarketingAnalyticsPlugin" />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Description
              <textarea className="input mt-1" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
            </label>
            <div className="text-xs text-slate-500">{selected.size} operations selected</div>
            <button className="btn w-full justify-center" disabled={!canCreate || create.isPending} onClick={() => create.mutate()}>
              <Plug2 size={14} /> {create.isPending ? 'Creating...' : 'Create plugin'}
            </button>
            {create.error && <p className="text-xs text-rose-600">{(create.error as Error).message}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
