import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  Download,
  FileJson2,
  Globe,
  Info,
  KeyRound,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCcw,
  Trash2,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import Badge from '../../../components/Badge';
import EmptyState from '../../../components/EmptyState';
import DataTable, { type Column } from '../../../components/DataTable';
import {
  catalogApi,
  openApiSourcesApi,
  type RegisterOpenApiSourceRequest,
  type UpdateOpenApiSourceRequest,
} from '../../../services/api';
import type { OpenApiAuthKind, OpenApiSource } from '../../../data/types';
import type { ApiCatalogContext } from '../ApiCatalogPage';

/**
 * Sources tab — manage the OpenAPI documents that feed the API Catalog.
 *
 * This used to be a standalone left-nav page; per the simplified UX it now lives inside
 * API Catalog because registering sources is just one half of the catalog workflow.
 * The other half (browsing endpoints) sits in the Endpoints tab.
 *
 * Auto-opens the register-source modal when the URL has `?new=1` so the header's
 * "Register Source" action can deep-link into this tab and pop the form in one click.
 */

const SAMPLES: { name: string; displayName: string; url: string; description: string }[] = [
  {
    name: 'petstore',
    displayName: 'Swagger Petstore',
    url: 'https://petstore3.swagger.io/api/v3/openapi.json',
    description: 'Canonical OpenAPI 3 sample. Several GET endpoints to validate the real execution path.',
  },
];

export default function SourcesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const { openStandards } = useOutletContext<ApiCatalogContext>();
  const sources = useQuery({ queryKey: ['openapi.sources'], queryFn: () => openApiSourcesApi.list() });
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => catalogApi.getCatalog() });
  const [editing, setEditing] = useState<OpenApiSource | 'new' | null>(null);

  // Header button deep-links here via ?new=1 — auto-open the register modal once.
  useEffect(() => {
    if (search.get('new') === '1' && editing === null) {
      setEditing('new');
      const next = new URLSearchParams(search);
      next.delete('new');
      setSearch(next, { replace: true });
    }
  }, [search, setSearch, editing]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['openapi.sources'] });
    qc.invalidateQueries({ queryKey: ['catalog'] });
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['endpoints'] });
    qc.invalidateQueries({ queryKey: ['metrics'] });
  };

  const refresh = useMutation({ mutationFn: (id: string) => openApiSourcesApi.refresh(id), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: string) => openApiSourcesApi.remove(id), onSuccess: invalidate });
  const toggleEnabled = useMutation({
    mutationFn: (s: OpenApiSource) => openApiSourcesApi.update(s.id, { enabled: !(s.enabled ?? true) }),
    onSuccess: invalidate,
  });

  // Map source -> [module name list] derived from the live catalog. Lets us show the
  // real module names per source row instead of just a count.
  const modulesBySource = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of catalog.data?.products ?? []) {
      const moduleNames = p.modules.map(m => m.displayName);
      // Real-source products carry productId === sourceId by construction.
      map.set(p.id, moduleNames);
    }
    return map;
  }, [catalog.data?.products]);

  const columns: Column<OpenApiSource>[] = [
    {
      key: 'name',
      header: 'Source',
      render: s => (
        <div className="flex items-start gap-2">
          <FileJson2 size={14} className="mt-0.5 text-brand-600" />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-slate-900">{s.displayName}</span>
              {s.enabled === false && <Badge tone="neutral">disabled</Badge>}
            </div>
            <div className="font-mono text-[11px] text-slate-500">{s.name}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'product',
      header: 'Product',
      render: s => (
        <div className="text-xs">
          <div className="text-slate-800">{s.title ?? s.displayName}</div>
          {s.version && <div className="text-slate-500">v{s.version}</div>}
        </div>
      ),
    },
    {
      key: 'modules',
      header: 'Modules',
      render: s => {
        const mods = modulesBySource.get(s.id) ?? [];
        if (mods.length === 0) return <span className="text-[11px] text-slate-400">—</span>;
        const head = mods.slice(0, 3);
        const rest = mods.length - head.length;
        return (
          <div className="flex flex-wrap gap-1 text-[11px]">
            {head.map(m => <Badge key={m} tone="neutral">{m}</Badge>)}
            {rest > 0 && <span className="text-slate-500">+{rest}</span>}
          </div>
        );
      },
    },
    {
      key: 'environment',
      header: 'Environment',
      render: s => <Badge tone={envTone(s.environment)}>{s.environment ?? 'dev'}</Badge>,
    },
    {
      key: 'baseUrl',
      header: 'Base URL',
      render: s => (
        <span className="font-mono text-[11px] text-slate-600 break-all">
          {s.baseUrlOverride ?? <span className="italic text-slate-400">from openapi.servers[0]</span>}
        </span>
      ),
    },
    {
      key: 'url',
      header: 'OpenAPI URL',
      render: s => (
        <a href={s.url} target="_blank" rel="noreferrer" className="break-all font-mono text-[11px] text-slate-600 hover:text-brand-700">
          {s.url}
        </a>
      ),
    },
    {
      key: 'auth',
      header: 'Auth',
      render: s => s.auth.kind === 'none'
        ? <Badge tone="neutral">none</Badge>
        : <Badge tone="brand"><KeyRound size={11} /> {s.auth.kind === 'bearer' ? 'Bearer' : `apiKey · ${s.auth.headerName ?? ''}`}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: s => <StatusBadge source={s} />,
    },
    {
      key: 'ops',
      header: 'Endpoints',
      align: 'right',
      render: s => <span className="tabular-nums text-sm">{s.operationCount ?? '—'}</span>,
    },
    {
      key: 'fetched',
      header: 'Last refreshed',
      render: s => (
        <span className="text-xs text-slate-500">
          {s.lastFetchedAt ? new Date(s.lastFetchedAt).toLocaleString() : 'never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: s => (
        <div className="flex items-center justify-end gap-1">
          <button
            className="btn-ghost px-2 py-1 text-xs"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate(s.id)}
            title="Re-fetch and re-parse the OpenAPI document"
          >
            <RefreshCcw size={12} /> Refresh
          </button>
          <button
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => setEditing(s)}
            title="Edit source"
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            className="btn-ghost px-2 py-1 text-xs"
            disabled={toggleEnabled.isPending}
            onClick={() => toggleEnabled.mutate(s)}
            title={s.enabled === false ? 'Enable in catalog' : 'Disable in catalog'}
          >
            {s.enabled === false ? <Power size={12} /> : <PowerOff size={12} />}
            {s.enabled === false ? 'Enable' : 'Disable'}
          </button>
          <button
            className="btn-danger px-2 py-1 text-xs"
            disabled={remove.isPending}
            onClick={() => {
              if (confirm(`Delete OpenAPI source "${s.displayName}"? This removes its product from the catalog.`)) {
                remove.mutate(s.id);
              }
            }}
            title="Delete source"
          >
            <Trash2 size={12} /> Remove
          </button>
        </div>
      ),
    },
  ];

  const real = sources.data?.filter(s => s.status === 'ok').length ?? 0;
  const failed = sources.data?.filter(s => s.status === 'error').length ?? 0;

  return (
    <div className="space-y-6 p-8">
      <div className="rounded-lg border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-brand-900">
        <div className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 shrink-0 text-brand-700" />
          <div className="flex-1">
            <div className="font-medium">How sources get into the platform</div>
            <p className="mt-1 text-xs text-brand-900/90">
              Manual registration is used for local, dev, and custom OpenAPI sources during MVP.
              Later, API sources can be automatically discovered from the Standalone Gateway catalog.{' '}
              <button
                type="button"
                onClick={openStandards}
                className="inline-flex items-center gap-1 font-medium text-brand-800 underline hover:text-brand-900"
              >
                <BookOpen size={11} /> View API Standards
              </button>{' '}
              for what teams need to publish in their OpenAPI document.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {real > 0 && <Badge tone="success"><CheckCircle2 size={11} /> {real} live</Badge>}
          {failed > 0 && <Badge tone="danger"><AlertCircle size={11} /> {failed} failed</Badge>}
          <span>{sources.data?.length ?? 0} registered</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost cursor-not-allowed opacity-60"
            disabled
            title="Coming later: auto-discover OpenAPI sources from the Standalone Gateway catalog."
          >
            <Compass size={14} /> Discover from Standalone Gateway
            <Badge tone="neutral" className="ml-1">coming later</Badge>
          </button>
          <button className="btn" onClick={() => setEditing('new')}>
            <Plus size={14} /> Register Source
          </button>
        </div>
      </div>

      {(!sources.data || sources.data.length === 0) && (
        <EmptyState
          Icon={Globe}
          title="No OpenAPI sources registered yet"
          description="Register an OpenAPI 3 JSON URL to bring real endpoints into the API Catalog. Until then, the catalog shows clearly-labelled sample data (Marketing only)."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button className="btn" onClick={() => setEditing('new')}>
                <Plus size={14} /> Register Source
              </button>
              <button className="btn-ghost" onClick={openStandards}>
                <BookOpen size={14} /> View API Standards
              </button>
            </div>
          }
        />
      )}

      {sources.data && sources.data.length > 0 && (
        <DataTable rows={sources.data} columns={columns} rowKey={s => s.id} empty="No sources." />
      )}

      <section>
        <h2 className="section-title">Sample OpenAPI documents</h2>
        <p className="mt-1 text-sm text-slate-500">
          One-click bootstrap with a well-known public document. Clearly labelled as sample data so you can validate the end-to-end flow before pointing at a real internal API.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {SAMPLES.map(s => (
            <SampleCard key={s.url} sample={s} onAdded={invalidate} />
          ))}
        </div>
      </section>

      {editing && (
        <SourceModal
          source={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function envTone(env: string | undefined): 'neutral' | 'info' | 'warning' | 'success' | 'danger' {
  switch ((env ?? 'dev').toLowerCase()) {
    case 'prod':
    case 'production': return 'danger';
    case 'staging':
    case 'stage':      return 'warning';
    case 'qa':
    case 'test':       return 'info';
    case 'local':
    case 'dev':        return 'neutral';
    default:           return 'neutral';
  }
}

function StatusBadge({ source }: { source: OpenApiSource }) {
  if (source.status === 'ok') {
    return (
      <span title={source.title ? `${source.title} v${source.version}` : 'Fetched OK'}>
        <Badge tone="success"><CheckCircle2 size={11} /> ok</Badge>
      </span>
    );
  }
  if (source.status === 'error') {
    return (
      <span title={source.lastError ?? 'Unknown error'}>
        <Badge tone="danger"><AlertCircle size={11} /> error</Badge>
      </span>
    );
  }
  return <Badge tone="neutral"><Clock size={11} /> unfetched</Badge>;
}

function SampleCard({ sample, onAdded }: { sample: typeof SAMPLES[number]; onAdded: () => void }) {
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setWorking(true); setErr(null);
    try {
      const source = await openApiSourcesApi.register({
        name: sample.name,
        displayName: sample.displayName,
        description: sample.description,
        url: sample.url,
        environment: 'dev',
      });
      await openApiSourcesApi.refresh(source.id);
      onAdded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileJson2 size={14} className="text-brand-600" />
          <div className="text-sm font-medium text-slate-900">{sample.displayName}</div>
        </div>
        <Badge tone="info">sample</Badge>
      </div>
      <p className="mt-2 text-xs text-slate-600">{sample.description}</p>
      <div className="mt-2 font-mono text-[11px] text-slate-500 break-all">{sample.url}</div>
      <div className="mt-3 flex items-center gap-2">
        <button className="btn" disabled={working} onClick={add}>
          <Download size={12} /> {working ? 'Registering…' : 'Register & fetch'}
        </button>
        {err && <span className="text-xs text-rose-700">{err}</span>}
      </div>
    </div>
  );
}

function SourceModal({ source, onClose, onSaved }: { source: OpenApiSource | null; onClose: () => void; onSaved: () => void }) {
  const isNew = source === null;
  const [form, setForm] = useState<RegisterOpenApiSourceRequest & { enabled?: boolean }>({
    name: source?.name ?? '',
    displayName: source?.displayName ?? '',
    description: source?.description ?? '',
    url: source?.url ?? '',
    baseUrlOverride: source?.baseUrlOverride ?? '',
    defaultHeaders: source?.defaultHeaders ?? {},
    environment: source?.environment ?? 'dev',
    enabled: source?.enabled ?? true,
    auth: source?.auth ?? { kind: 'none' },
  });
  const [headersText, setHeadersText] = useState(headerObjectToText(source?.defaultHeaders ?? {}));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setWorking(true); setError(null);
    try {
      const headers = headerTextToObject(headersText);
      if (isNew) {
        const created = await openApiSourcesApi.register({
          name: form.name,
          displayName: form.displayName,
          description: form.description,
          url: form.url,
          baseUrlOverride: form.baseUrlOverride,
          defaultHeaders: headers,
          environment: form.environment,
          auth: form.auth,
        });
        await openApiSourcesApi.refresh(created.id);
      } else if (source) {
        const patch: UpdateOpenApiSourceRequest = {
          displayName: form.displayName,
          description: form.description,
          url: form.url,
          baseUrlOverride: form.baseUrlOverride,
          defaultHeaders: headers,
          environment: form.environment,
          enabled: form.enabled,
          auth: form.auth,
        };
        await openApiSourcesApi.update(source.id, patch);
        // If the URL or auth changed, re-fetch so the catalog mirrors the new contract.
        if (patch.url !== source.url || patch.baseUrlOverride !== source.baseUrlOverride) {
          await openApiSourcesApi.refresh(source.id);
        }
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-6">
      <div className="card max-h-[92vh] w-full max-w-2xl overflow-auto">
        <div className="card-header flex items-center justify-between">
          <span>{isNew ? 'Register OpenAPI source' : `Edit ${source?.displayName}`}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="space-y-4 p-5">
          {!isNew && source && (
            <div className={clsx(
              'rounded-md border px-3 py-2 text-xs',
              source.status === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' :
              source.status === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' :
              'border-slate-200 bg-slate-50 text-slate-700',
            )}>
              <div className="font-medium">
                Status: {source.status}{source.title ? ` — ${source.title} v${source.version}` : ''}
              </div>
              {source.lastError && <div className="mt-1 break-all">{source.lastError}</div>}
              {source.status === 'ok' && (
                <div className="mt-1">{source.operationCount} operation{source.operationCount === 1 ? '' : 's'} discovered.</div>
              )}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="label">
              Name
              <input
                className="input mt-1 font-mono"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                disabled={!isNew}
                placeholder="petstore"
                title={!isNew ? 'Name is the stable id; create a new source to change it.' : undefined}
              />
            </label>
            <label className="label">
              Display name
              <input className="input mt-1" value={form.displayName ?? ''} onChange={e => setForm({ ...form, displayName: e.target.value })} placeholder="Swagger Petstore" />
            </label>
            <label className="md:col-span-2 label">
              OpenAPI URL <span className="text-slate-400">(OpenAPI 3 JSON; YAML not supported in MVP)</span>
              <input className="input mt-1 font-mono" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/openapi.json" />
            </label>
            <label className="md:col-span-2 label">
              Description
              <input className="input mt-1" value={form.description ?? ''} onChange={e => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="md:col-span-2 label">
              Base URL override <span className="text-slate-400">(default: <code>servers[0].url</code> from the doc)</span>
              <input className="input mt-1 font-mono" value={form.baseUrlOverride ?? ''} onChange={e => setForm({ ...form, baseUrlOverride: e.target.value })} placeholder="https://api.internal/v1" />
            </label>
            <label className="label">
              Environment
              <select
                className="input mt-1"
                value={form.environment ?? 'dev'}
                onChange={e => setForm({ ...form, environment: e.target.value })}
              >
                <option value="local">local</option>
                <option value="dev">dev</option>
                <option value="qa">qa</option>
                <option value="staging">staging</option>
                <option value="prod">prod</option>
              </select>
            </label>
            {!isNew && (
              <label className="label">
                Enabled
                <select
                  className="input mt-1"
                  value={form.enabled === false ? 'false' : 'true'}
                  onChange={e => setForm({ ...form, enabled: e.target.value === 'true' })}
                >
                  <option value="true">enabled — surfaced in catalog</option>
                  <option value="false">disabled — hidden from catalog</option>
                </select>
              </label>
            )}
            <label className="md:col-span-2 label">
              Default headers <span className="text-slate-400">(one per line, <code>Name: value</code>)</span>
              <textarea className="input mt-1 font-mono" rows={3} value={headersText} onChange={e => setHeadersText(e.target.value)} placeholder="X-Tenant: tenant-001&#10;X-Trace-Source: oneadmin" />
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <KeyRound size={14} className="text-slate-500" />
              Auth
              <span className="text-xs text-slate-500">— secrets stay server-side, never echoed to the UI.</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="label">
                Kind
                <select
                  className="input mt-1"
                  value={form.auth?.kind ?? 'none'}
                  onChange={e => setForm({ ...form, auth: { ...(form.auth ?? { kind: 'none' }), kind: e.target.value as OpenApiAuthKind } })}
                >
                  <option value="none">none</option>
                  <option value="apiKey">apiKey</option>
                  <option value="bearer">bearer</option>
                </select>
              </label>
              {form.auth?.kind === 'apiKey' && (
                <label className="label">
                  Header name
                  <input className="input mt-1 font-mono" value={form.auth.headerName ?? ''} onChange={e => setForm({ ...form, auth: { ...form.auth!, headerName: e.target.value } })} placeholder="X-Api-Key" />
                </label>
              )}
              {form.auth && form.auth.kind !== 'none' && (
                <label className="label">
                  Secret <span className="text-slate-400">(stored server-side)</span>
                  <input className="input mt-1 font-mono" type="password" value={form.auth.secret ?? ''} onChange={e => setForm({ ...form, auth: { ...form.auth!, secret: e.target.value } })} placeholder="paste secret" />
                </label>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={working || !form.url || !form.name} onClick={save}>
            <Download size={14} /> {working ? 'Saving…' : isNew ? 'Register & fetch' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function headerObjectToText(h: Record<string, string>): string {
  return Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\n');
}

function headerTextToObject(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}
