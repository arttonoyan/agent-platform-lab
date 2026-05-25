import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bot, Search, ShieldCheck, Wrench } from 'lucide-react';
import CreateToolSetModal, { type CreateToolSetSelection } from '../CreateToolSetModal';
import {
  api,
  type AgentDefinition,
  type ApiOperation,
  type ApiSpecSummary,
  type PluginDefinition,
} from '../../lib/platform';
import {
  buildEndpointRows,
  buildSampleEndpointRows,
  type CatalogEndpointRow,
  type ToolLifecycle,
} from '../../lib/catalog';

const METHOD_FILTERS = ['all', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type MethodFilter = (typeof METHOD_FILTERS)[number];
type ToolStatusFilter = 'all' | 'published' | 'draft' | 'not-configured';

const HTTP_METHOD_TONE: Record<string, string> = {
  GET:    'bg-emerald-50 text-emerald-700',
  POST:   'bg-amber-50 text-amber-700',
  PUT:    'bg-amber-50 text-amber-700',
  PATCH:  'bg-amber-50 text-amber-700',
  DELETE: 'bg-rose-50 text-rose-700',
};

const TOOL_STATUS_TONE: Record<ToolLifecycle, string> = {
  'not-configured': 'bg-slate-100 text-slate-600',
  draft:            'bg-amber-100 text-amber-800',
  published:        'bg-emerald-100 text-emerald-800',
};

const TOOL_STATUS_LABEL: Record<ToolLifecycle, string> = {
  'not-configured': 'Not configured',
  draft:            'Draft tool',
  published:        'Published tool',
};

/**
 * Endpoints tab inside the new Tools page. Replaces the old API Catalog endpoint browser.
 *
 * Workflow this tab supports:
 *   1. Filter endpoints by product / module / method / tool status.
 *   2. Tick endpoints from the SAME OpenAPI source.
 *   3. Click "Create Tool Set from selected endpoints" → CreateToolSetModal → /tools/tool-sets/<id>.
 *
 * Each row also links into the endpoint detail page (Overview / Schema / Source).
 */
export default function EndpointsTab() {
  const apisQuery = useQuery({ queryKey: ['apis'], queryFn: () => api.listApiSpecs() });
  const pluginsQuery = useQuery({ queryKey: ['plugins', 'all'], queryFn: () => api.listPlugins() });
  const agentsQuery = useQuery({ queryKey: ['agents'], queryFn: () => api.listAgents() });

  const specs = apisQuery.data ?? [];
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

  const plugins: PluginDefinition[] = pluginsQuery.data ?? [];
  const agents: AgentDefinition[] = agentsQuery.data ?? [];

  // pluginId -> how many agents have it attached, to render the per-row "Used by N agents" badge.
  const agentsByPluginId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of agents) {
      for (const pid of a.pluginIds) {
        map[pid] = (map[pid] ?? 0) + 1;
      }
    }
    return map;
  }, [agents]);

  const specsById = useMemo(() => {
    const m: Record<string, ApiSpecSummary> = {};
    for (const s of specs) m[s.id] = s;
    return m;
  }, [specs]);

  const importedRows = useMemo(
    () => buildEndpointRows({ specs, operationsBySpec, plugins, agentsByPluginId }),
    [specs, operationsBySpec, plugins, agentsByPluginId],
  );
  const sampleRows = useMemo(() => buildSampleEndpointRows(), []);
  const hasImportedRows = importedRows.length > 0;
  const visibleRows = hasImportedRows ? importedRows : sampleRows;

  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [statusFilter, setStatusFilter] = useState<ToolStatusFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState<CreateToolSetSelection | null>(null);

  const productOptions = useMemo(() => {
    const seen = new Map<string, string>();
    visibleRows.forEach(r => seen.set(r.product, r.productDisplay));
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [visibleRows]);

  const moduleOptions = useMemo(() => {
    const seen = new Map<string, string>();
    visibleRows
      .filter(r => productFilter === 'all' || r.product === productFilter)
      .forEach(r => seen.set(r.module, r.moduleDisplay));
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [visibleRows, productFilter]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleRows.filter(r => {
      if (productFilter !== 'all' && r.product !== productFilter) return false;
      if (moduleFilter !== 'all' && r.module !== moduleFilter) return false;
      if (methodFilter !== 'all' && r.method.toUpperCase() !== methodFilter) return false;
      if (statusFilter !== 'all' && r.toolStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        r.path.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.operationId.toLowerCase().includes(q) ||
        (r.toolName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [visibleRows, productFilter, moduleFilter, methodFilter, statusFilter, search]);

  const groupedRows = useMemo(() => groupByProductModule(filteredRows), [filteredRows]);

  const selectionInfo = useMemo(() => {
    const rows = filteredRows.filter(r => selectedIds.has(r.id));
    const sampleCount = rows.filter(r => r.source === 'sample').length;
    const specIds = new Set(rows.map(r => r.specId).filter(Boolean) as string[]);
    return { rows, sampleCount, specIds };
  }, [filteredRows, selectedIds]);

  const selectionCount = selectionInfo.rows.length;
  const sourceCountInSelection = selectionInfo.specIds.size;
  const canCreateToolSet =
    selectionCount > 0 && selectionInfo.sampleCount === 0 && sourceCountInSelection === 1;

  let createToolSetTitle = 'Create a Tool Set from the selected endpoints';
  if (selectionCount === 0) createToolSetTitle = 'Select one or more endpoints first';
  else if (selectionInfo.sampleCount > 0)
    createToolSetTitle = 'Sample endpoints cannot be turned into tools — register a real source first';
  else if (sourceCountInSelection > 1)
    createToolSetTitle = 'A Tool Set can only span one OpenAPI source. Narrow the selection to one source.';

  function toggleSelected(id: string, available: boolean) {
    if (!available) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreateModal() {
    if (!canCreateToolSet) return;
    const [specId] = selectionInfo.specIds;
    const spec = specsById[specId];
    if (!spec) return;
    setCreating({
      spec,
      endpoints: selectionInfo.rows.map(r => ({
        operationId: r.operationId,
        method: r.method,
        path: r.path,
        summary: r.summary,
      })),
    });
  }

  function resetFilters() {
    setSearch('');
    setProductFilter('all');
    setModuleFilter('all');
    setMethodFilter('all');
    setStatusFilter('all');
  }

  const isLoading = apisQuery.isPending || (specs.length > 0 && opsResults.some(r => r.isPending));
  const error = apisQuery.error;

  return (
    <div className="space-y-4">
      {!hasImportedRows && (
        <div className="flex flex-wrap items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Sample data</p>
            <p className="mt-0.5 text-xs text-amber-800">
              No OpenAPI source has been registered yet. The endpoints below are illustrative seed data
              and cannot be configured as tools. Open the <strong>API Sources</strong> tab and click
              <strong> Register Source</strong> to bring real endpoints into Tools.
            </p>
          </div>
        </div>
      )}

      <div className="card flex flex-wrap items-center gap-3 p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search path, summary, operationId, tool name…"
            className="input pl-8"
          />
        </div>
        <FilterSelect label="Product" value={productFilter} onChange={value => {
          setProductFilter(value);
          setModuleFilter('all');
        }}>
          <option value="all">All products</option>
          {productOptions.map(([id, display]) => (
            <option key={id} value={id}>{display}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="Module" value={moduleFilter} onChange={setModuleFilter}>
          <option value="all">All modules</option>
          {moduleOptions.map(([id, display]) => (
            <option key={id} value={id}>{display}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="Method" value={methodFilter} onChange={value => setMethodFilter(value as MethodFilter)}>
          {METHOD_FILTERS.map(m => (
            <option key={m} value={m}>{m === 'all' ? 'All methods' : m}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="Status" value={statusFilter} onChange={value => setStatusFilter(value as ToolStatusFilter)}>
          <option value="all">All statuses</option>
          <option value="published">Published only</option>
          <option value="draft">Draft tools</option>
          <option value="not-configured">Not configured</option>
        </FilterSelect>
      </div>

      {selectionCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50/60 px-4 py-2 text-sm text-brand-900">
          <span>
            <strong>{selectionCount}</strong> endpoint{selectionCount === 1 ? '' : 's'} selected
            {sourceCountInSelection > 1 && (
              <span className="ml-2 text-rose-700">
                <AlertTriangle size={12} className="mr-1 inline" />
                spanning {sourceCountInSelection} sources
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </button>
            <button
              type="button"
              className="btn"
              onClick={openCreateModal}
              disabled={!canCreateToolSet}
              title={createToolSetTitle}
            >
              <Wrench size={14} /> Create Tool Set from selected endpoints
            </button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading endpoints…</p>}
      {error instanceof Error && <p className="text-sm text-rose-600">{error.message}</p>}

      {!isLoading && filteredRows.length === 0 && (
        <div className="card flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-slate-500">
          <p>No endpoints match the current filters.</p>
          <button type="button" className="btn-ghost" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
      )}

      {!isLoading && filteredRows.length > 0 && (
        <div className="space-y-5">
          {groupedRows.map(productGroup => (
            <section key={productGroup.product}>
              <header className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {productGroup.productDisplay}
                </h3>
                <span className="pill bg-slate-100 text-slate-600">{productGroup.count}</span>
              </header>
              <div className="space-y-3">
                {productGroup.modules.map(modGroup => (
                  <div key={modGroup.module} className="card">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{modGroup.moduleDisplay}</div>
                        <div className="text-xs text-slate-500">{modGroup.endpoints[0]?.sourceDisplay}</div>
                      </div>
                      <span className="pill bg-slate-100 text-slate-600">
                        {modGroup.endpoints.length} {modGroup.endpoints.length === 1 ? 'endpoint' : 'endpoints'}
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {modGroup.endpoints.map(row => (
                        <EndpointRow
                          key={row.id}
                          row={row}
                          checked={selectedIds.has(row.id)}
                          onToggle={available => toggleSelected(row.id, available)}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <CreateToolSetModal
        open={!!creating}
        selection={creating}
        onClose={() => {
          setCreating(null);
          setSelectedIds(new Set());
        }}
      />
    </div>
  );
}

function EndpointRow({
  row,
  checked,
  onToggle,
}: {
  row: CatalogEndpointRow;
  checked: boolean;
  onToggle: (available: boolean) => void;
}) {
  const isSample = row.source === 'sample';
  const checkboxAvailable = !isSample;
  const methodTone = HTTP_METHOD_TONE[row.method.toUpperCase()] ?? 'bg-slate-100 text-slate-700';

  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <input
        type="checkbox"
        className="mt-1.5"
        checked={checked}
        disabled={!checkboxAvailable}
        onChange={() => onToggle(checkboxAvailable)}
        title={
          isSample
            ? 'Sample endpoints cannot be turned into tools'
            : 'Select for "Create Tool Set from selected endpoints"'
        }
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`pill font-mono ${methodTone}`}>{row.method.toUpperCase()}</span>
          {row.specId ? (
            <Link
              to={`/tools/sources/${row.specId}/endpoints/${encodeURIComponent(row.operationId)}`}
              className="font-mono text-sm text-slate-800 hover:text-brand-700"
            >
              {row.path}
            </Link>
          ) : (
            <span className="font-mono text-sm text-slate-800">{row.path}</span>
          )}
          {isSample ? (
            <span
              className="pill bg-amber-100 text-amber-800"
              title="Seeded sample - no real OpenAPI source backs this row"
            >
              Sample
            </span>
          ) : (
            <span className="pill bg-slate-100 text-slate-700">Imported</span>
          )}
          <span
            className={`pill ${row.isWrite ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}
          >
            {row.isWrite ? 'Write' : 'Read'}
          </span>
          <span className={`pill ${TOOL_STATUS_TONE[row.toolStatus]}`}>{TOOL_STATUS_LABEL[row.toolStatus]}</span>
          {row.isWrite && row.toolStatus !== 'not-configured' && (
            <span
              className="pill bg-violet-100 text-violet-800"
              title="Write endpoints require approval before agents can call them at runtime."
            >
              <ShieldCheck size={12} className="mr-1 inline" />
              Requires approval
            </span>
          )}
          {row.isWrite && row.toolStatus === 'not-configured' && (
            <span
              className="pill bg-slate-100 text-slate-500"
              title="Write endpoints are disabled for the MVP demo."
            >
              Disabled for MVP
            </span>
          )}
        </div>
        <div className="mt-1 text-sm font-medium text-slate-900">{row.summary || row.operationId}</div>
        <div className="mt-0.5 text-xs text-slate-500">
          <span className="font-mono">{row.operationId}</span>
          <span className="mx-2 text-slate-300">·</span>
          <span>{row.sourceDisplay}</span>
          {row.toolName && (
            <>
              <span className="mx-2 text-slate-300">·</span>
              <span>tool <span className="font-mono">{row.toolName}</span></span>
            </>
          )}
          {row.pluginName && row.pluginId && (
            <>
              <span className="mx-2 text-slate-300">·</span>
              <span>
                used by{' '}
                <Link
                  to={`/tools/tool-sets/${row.pluginId}`}
                  className="font-mono text-brand-700 hover:text-brand-900"
                >
                  {row.pluginName}
                </Link>
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-slate-500">
        <span title="Number of agents that have a Tool Set containing this endpoint attached">
          <Bot size={12} className="mr-1 inline text-slate-400" />
          {row.agentsUsing} {row.agentsUsing === 1 ? 'agent' : 'agents'}
        </span>
        {row.specId && (
          <Link
            to={`/tools/sources/${row.specId}/endpoints/${encodeURIComponent(row.operationId)}`}
            className="text-brand-700 hover:text-brand-900"
          >
            View →
          </Link>
        )}
      </div>
    </li>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {label}
      <select className="input min-w-[140px]" value={value} onChange={e => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}

interface GroupedRows extends Array<{
  product: string;
  productDisplay: string;
  count: number;
  modules: Array<{
    module: string;
    moduleDisplay: string;
    endpoints: CatalogEndpointRow[];
  }>;
}> {}

function groupByProductModule(rows: CatalogEndpointRow[]): GroupedRows {
  const productMap = new Map<string, GroupedRows[number]>();
  for (const r of rows) {
    let pg = productMap.get(r.product);
    if (!pg) {
      pg = { product: r.product, productDisplay: r.productDisplay, count: 0, modules: [] };
      productMap.set(r.product, pg);
    }
    let mg = pg.modules.find(m => m.module === r.module);
    if (!mg) {
      mg = { module: r.module, moduleDisplay: r.moduleDisplay, endpoints: [] };
      pg.modules.push(mg);
    }
    mg.endpoints.push(r);
    pg.count += 1;
  }
  for (const pg of productMap.values()) {
    pg.modules.sort((a, b) => a.moduleDisplay.localeCompare(b.moduleDisplay));
    for (const mg of pg.modules) {
      mg.endpoints.sort((a, b) => a.path.localeCompare(b.path));
    }
  }
  return Array.from(productMap.values()).sort((a, b) => a.productDisplay.localeCompare(b.productDisplay));
}
