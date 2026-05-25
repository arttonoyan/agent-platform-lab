import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ShieldCheck, Wrench, X } from 'lucide-react';
import { api, type ApiSpecSummary } from '../lib/platform';
import { isWriteMethod } from '../lib/catalog';

export interface CreateToolSetSelection {
  /** The single API source every selected endpoint must share. */
  spec: ApiSpecSummary;
  endpoints: Array<{
    operationId: string;
    method: string;
    path: string;
    summary?: string;
  }>;
}

interface Props {
  open: boolean;
  selection: CreateToolSetSelection | null;
  onClose: () => void;
}

/**
 * One-step Tool Set creation modal. Triggered from the Endpoints tab when the operator
 * picks one or more operations from a single OpenAPI source and clicks
 * "Create Tool Set from selected endpoints".
 *
 * Why a modal (vs the older two-step flow through the Source detail page): the IA
 * refactor wants endpoint selection and Tool Set creation to be a single visible
 * action on the Endpoints tab. On submit we redirect straight to the new Tool Set
 * detail page so the user lands where they keep configuring tool names + descriptions.
 */
export default function CreateToolSetModal({ open, selection, onClose }: Props) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setError(null);
    }
  }, [open]);

  const create = useMutation({
    mutationFn: () => {
      if (!selection) throw new Error('No endpoints selected.');
      return api.createPlugin({
        name: name.trim(),
        displayName: name.trim(),
        description: description.trim(),
        apiSpecId: selection.spec.id,
        operationIds: selection.endpoints.map(e => e.operationId),
      });
    },
    onSuccess: toolSet => {
      onClose();
      navigate(`/tools/tool-sets/${toolSet.id}`);
    },
    onError: ex => setError((ex as Error).message),
  });

  if (!open || !selection) return null;

  const writeCount = selection.endpoints.filter(e => isWriteMethod(e.method)).length;
  const canSubmit = !create.isPending && name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-6">
      <div className="card max-h-[90vh] w-full max-w-xl overflow-auto">
        <div className="card-header flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Wrench size={14} className="text-brand-600" /> Create Tool Set from selected endpoints
          </span>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <p className="text-xs text-slate-600">
            Each selected operation becomes one callable AI tool. The Tool Set groups them
            and owns auth, permissions, and publish lifecycle. You can rename each tool
            and edit descriptions on the next page.
          </p>

          <section className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Source</div>
                <div className="mt-0.5 font-medium text-slate-800">{selection.spec.displayName}</div>
                <div className="mt-0.5 font-mono text-[11px] text-slate-500">{selection.spec.serviceName}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Selected</div>
                <div className="mt-0.5 font-medium text-slate-800">
                  {selection.endpoints.length} {selection.endpoints.length === 1 ? 'endpoint' : 'endpoints'}
                </div>
                {writeCount > 0 && (
                  <div className="mt-0.5 text-amber-700">
                    <ShieldCheck size={10} className="mr-1 inline" />
                    {writeCount} write {writeCount === 1 ? 'op' : 'ops'} — requires approval
                  </div>
                )}
              </div>
            </div>
            <ul className="mt-3 max-h-32 space-y-1 overflow-auto">
              {selection.endpoints.map(e => (
                <li key={e.operationId} className="flex items-center gap-2">
                  <span className="pill bg-slate-100 text-slate-700 font-mono">{e.method.toUpperCase()}</span>
                  <span className="font-mono text-[11px] text-slate-700">{e.path}</span>
                  {e.summary && <span className="text-slate-500 truncate">— {e.summary}</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-3 md:grid-cols-1">
            <label className="block text-xs font-medium text-slate-600">
              Tool Set name
              <input
                className="input mt-1 font-mono"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="MarketingAnalyticsToolSet"
                autoFocus
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Description
              <textarea
                className="input mt-1"
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Read-only delivery, open-rate, CTR, and per-campaign performance reports."
              />
            </label>
            {writeCount > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle size={12} className="mr-1 inline" />
                Write endpoints will be created in the Tool Set but stay marked
                <strong> Requires approval</strong> and are disabled for execution at MVP.
                You can publish read-only tools immediately.
              </div>
            )}
            {error && (
              <p className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">{error}</p>
            )}
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={!canSubmit} onClick={() => create.mutate()}>
            <Wrench size={14} /> {create.isPending ? 'Creating…' : 'Create Tool Set'}
          </button>
        </div>
      </div>
    </div>
  );
}
