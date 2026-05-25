import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cable, ListTree, Plus, RefreshCw, Server, Trash2 } from 'lucide-react';
import { api, type ApiOperation, type ApiSpecSummary } from '../../lib/platform';
import { classifyService, isWriteMethod } from '../../lib/catalog';

interface Props {
  onRegisterClick: () => void;
}

type SourceStatus = 'Imported' | 'Sample' | 'Disabled' | 'Failed';

const STATUS_TONE: Record<SourceStatus, string> = {
  Imported: 'bg-emerald-100 text-emerald-800',
  Sample:   'bg-amber-100 text-amber-800',
  Disabled: 'bg-slate-100 text-slate-600',
  Failed:   'bg-rose-100 text-rose-800',
};

/**
 * API Sources tab — registered OpenAPI sources the platform fetches and indexes. Each
 * source becomes a pool of endpoints (visible on the Endpoints tab) which can be
 * wrapped into Tool Sets.
 *
 * Each row exposes:
 *   product · module · base URL · OpenAPI URL · status · endpoint count · last imported · owner
 *
 * Actions are scoped to the source: View endpoints, Re-import, Delete.
 * Disable + Discover-from-Gateway are stubbed on the page header per the IA spec.
 */
export default function SourcesTab({ onRegisterClick }: Props) {
  const qc = useQueryClient();
  const apisQuery = useQuery({ queryKey: ['apis'], queryFn: () => api.listApiSpecs() });
  const specs = apisQuery.data ?? [];

  // Per-spec operations queries are required to compute the "X write" badge that
  // shows beneath the endpoint count. We fetch each in parallel and tolerate any
  // single one being pending.
  const opsResults = useQueries({
    queries: specs.map(spec => ({
      queryKey: ['ops', spec.id],
      queryFn: () => api.getApiOperations(spec.id),
    })),
  });
  const operationsBySpec = useMemo(() => {
    const map: Record<string, ApiOperation[] | undefined> = {};
    specs.forEach((spec, idx) => {
      map[spec.id] = opsResults[idx]?.data;
    });
    return map;
  }, [specs, opsResults]);

  const reimport = useMutation({
    mutationFn: ({ serviceName, displayName, openApiUrl }: { serviceName: string; displayName: string; openApiUrl: string }) =>
      api.importApiSpec({ serviceName, displayName, openApiUrl }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apis'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteApiSpec(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apis'] }),
  });

  if (apisQuery.isPending) {
    return <p className="text-sm text-slate-500">Loading sources…</p>;
  }
  if (apisQuery.error instanceof Error) {
    return <p className="text-sm text-rose-600">{apisQuery.error.message}</p>;
  }

  if (specs.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 px-5 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Cable size={20} />
        </div>
        <div>
          <p className="text-base font-medium text-slate-900">No OpenAPI sources registered yet.</p>
          <p className="mt-1 text-sm text-slate-500">
            Register an OpenAPI 3.x source to bring real endpoints into Tools.
          </p>
        </div>
        <button type="button" className="btn" onClick={onRegisterClick}>
          <Plus size={14} /> Register Source
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {specs.map(spec => {
        const meta = classifyService(spec.serviceName);
        const ops = operationsBySpec[spec.id];
        const writeOpCount = (ops ?? []).filter(o => isWriteMethod(o.method)).length;
        const opCount = ops?.length ?? spec.operationCount;
        // PluginRegistry does not yet expose Disabled / Failed source statuses, so
        // every imported source renders as Imported for now. The schema is ready for
        // the other states; once the backend emits them we just drop the literal here.
        const status: SourceStatus = 'Imported';
        return (
          <SourceRow
            key={spec.id}
            spec={spec}
            meta={meta}
            opCount={opCount}
            writeOpCount={writeOpCount}
            status={status}
            onReimport={() =>
              reimport.mutate({
                serviceName: spec.serviceName,
                displayName: spec.displayName,
                openApiUrl: `${spec.baseAddress}/openapi/v1.json`,
              })
            }
            reimporting={reimport.isPending}
            onDelete={() => {
              if (
                confirm(
                  `Delete the imported source "${spec.displayName}"? Any Tool Sets referencing it will become orphaned.`,
                )
              ) {
                remove.mutate(spec.id);
              }
            }}
            deleting={remove.isPending}
          />
        );
      })}

      {(reimport.error || remove.error) && (
        <p className="text-xs text-rose-600">
          {(reimport.error as Error)?.message ?? (remove.error as Error)?.message}
        </p>
      )}
    </div>
  );
}

interface SourceRowProps {
  spec: ApiSpecSummary;
  meta: ReturnType<typeof classifyService>;
  opCount: number;
  writeOpCount: number;
  status: SourceStatus;
  onReimport: () => void;
  reimporting: boolean;
  onDelete: () => void;
  deleting: boolean;
}

function SourceRow({ spec, meta, opCount, writeOpCount, status, onReimport, reimporting, onDelete, deleting }: SourceRowProps) {
  const openApiUrl = `${spec.baseAddress}/openapi/v1.json`;
  return (
    <article className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700">
            <Server size={16} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/tools/sources/${spec.id}`}
                className="text-sm font-semibold text-slate-900 hover:text-brand-700"
              >
                {spec.displayName}
              </Link>
              <span className={`pill ${STATUS_TONE[status]}`}>{status}</span>
              <span className="pill bg-slate-100 text-slate-600">
                {meta.productDisplay} / {meta.moduleDisplay}
              </span>
            </div>
            <div className="mt-1 font-mono text-xs text-slate-500">{spec.serviceName}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link className="btn-ghost" to={`/tools/sources/${spec.id}`}>
            <ListTree size={14} /> View endpoints
          </Link>
          <button
            type="button"
            className="btn-ghost"
            disabled={reimporting}
            onClick={onReimport}
            title="Re-fetch the OpenAPI document and update the imported operations"
          >
            <RefreshCw size={14} /> Re-import
          </button>
          <button
            type="button"
            className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
            disabled={deleting}
            title="Delete this source"
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-2 px-5 py-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <Detail term="Product" value={meta.productDisplay} />
        <Detail term="Module" value={meta.moduleDisplay} />
        <Detail term="Owner team" value={meta.ownerTeam} />
        <Detail term="Base URL" value={spec.baseAddress} mono />
        <Detail term="OpenAPI URL" value={openApiUrl} mono />
        <Detail term="Endpoints" value={`${opCount} (${writeOpCount} write)`} />
        <Detail term="Last imported" value={new Date(spec.importedAt).toLocaleString()} />
      </dl>
    </article>
  );
}

function Detail({ term, value, mono }: { term: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{term}</dt>
      <dd className={`mt-0.5 break-all text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
