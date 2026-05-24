import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useMatch, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Filter, Library, Search } from 'lucide-react';
import clsx from 'clsx';
import Badge from '../../../components/Badge';
import EmptyState from '../../../components/EmptyState';
import MethodBadge from '../../../components/MethodBadge';
import ProductIcon from '../../../components/ProductIcon';
import { StabilityBadge } from '../../../components/StatusBadge';
import { catalogApi, toolsApi } from '../../../services/api';
import type { Product, RegistryTool } from '../../../data/types';

/**
 * Endpoints tab — the default API Catalog view.
 *
 * Layout: Product → Module → Endpoint tree on the left, the selected endpoint's tabbed
 * detail (Overview / Tool Configuration / Playground / Publish) in the right outlet.
 * The split is draggable — width persists per-developer in localStorage so the layout
 * feels stable across reloads.
 *
 * Real OpenAPI sources are surfaced as Products under "Real (OpenAPI sources)". When no
 * real source is registered, the Marketing seed is shown under "Sample data" with a
 * clear badge — Fleet / Field Ops / HR samples are intentionally not surfaced so the
 * MVP stays Marketing-focused.
 */

const TREE_MIN_PX = 240;
const TREE_MAX_PX = 640;
const TREE_DEFAULT_PX = 320;
const TREE_STORAGE_KEY = 'apiCatalog.endpointsTab.treeWidthPx';

function loadStoredTreeWidth(): number {
  if (typeof window === 'undefined') return TREE_DEFAULT_PX;
  try {
    const raw = window.localStorage.getItem(TREE_STORAGE_KEY);
    if (!raw) return TREE_DEFAULT_PX;
    const n = Number(raw);
    if (!Number.isFinite(n)) return TREE_DEFAULT_PX;
    return Math.max(TREE_MIN_PX, Math.min(TREE_MAX_PX, n));
  } catch {
    return TREE_DEFAULT_PX;
  }
}

export default function EndpointsTab() {
  const navigate = useNavigate();
  const match = useMatch('/api-catalog/endpoints/:endpointId');
  const selectedEndpointId = match?.params.endpointId;

  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => catalogApi.getCatalog() });
  const tools = useQuery({ queryKey: ['tools'], queryFn: () => toolsApi.listRegistryTools() });

  const products = catalog.data?.products ?? [];

  const [treeWidth, setTreeWidth] = useState<number>(loadStoredTreeWidth);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    try { window.localStorage.setItem(TREE_STORAGE_KEY, String(treeWidth)); } catch { /* ignore */ }
  }, [treeWidth]);

  // Default to the first endpoint of the first product on load.
  useEffect(() => {
    if (!selectedEndpointId && products[0]?.modules[0]?.endpoints[0]) {
      const first = products[0].modules[0].endpoints[0];
      navigate(`/api-catalog/endpoints/${first.id}`, { replace: true });
    }
  }, [selectedEndpointId, products, navigate]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = treeWidth;
    setIsDragging(true);

    // While dragging, lock the document cursor + suppress text selection so the resize
    // feels native even if the pointer leaves the splitter strip.
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const next = Math.max(TREE_MIN_PX, Math.min(TREE_MAX_PX, startWidth + (ev.clientX - startX)));
      setTreeWidth(next);
    };
    const onUp = () => {
      setIsDragging(false);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [treeWidth]);

  return (
    <div className={clsx('flex h-full overflow-hidden', isDragging && 'select-none')}>
      <div style={{ width: treeWidth }} className="h-full shrink-0">
        <CatalogTree
          products={products}
          tools={tools.data ?? []}
          selectedEndpointId={selectedEndpointId}
        />
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={treeWidth}
        aria-valuemin={TREE_MIN_PX}
        aria-valuemax={TREE_MAX_PX}
        onMouseDown={startDrag}
        onDoubleClick={() => setTreeWidth(TREE_DEFAULT_PX)}
        title="Drag to resize · double-click to reset"
        className={clsx(
          'h-full w-1 shrink-0 cursor-col-resize transition-colors',
          isDragging ? 'bg-brand-400' : 'bg-transparent hover:bg-brand-300/60',
        )}
      />

      <section className="flex-1 overflow-auto bg-slate-50">
        {selectedEndpointId
          ? <Outlet />
          : (
            <div className="p-12">
              <EmptyState
                Icon={Library}
                title="Pick an endpoint"
                description="Browse the Product → Module → Endpoint tree on the left. Each endpoint has its own Overview, Tool Configuration, Playground, and Publish tabs."
              />
            </div>
          )}
      </section>
    </div>
  );
}

interface TreeProps {
  products: Product[];
  tools: RegistryTool[];
  selectedEndpointId: string | undefined;
}

/** Treat a product as a real OpenAPI source if any endpoint inside it has a sourceId. */
function isRealProduct(p: Product): boolean {
  return p.modules.some(m => m.endpoints.some(e => !!e.sourceId));
}

function CatalogTree({ products, tools, selectedEndpointId }: TreeProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // On first load, expand the product / module that contains the selected endpoint.
  useEffect(() => {
    if (!selectedEndpointId || expanded.size > 0) return;
    for (const p of products) {
      for (const m of p.modules) {
        if (m.endpoints.some(e => e.id === selectedEndpointId)) {
          setExpanded(new Set([p.id, m.id]));
          return;
        }
      }
    }
  }, [products, selectedEndpointId, expanded.size]);

  const toolByEndpoint = useMemo(() => {
    const map = new Map<string, RegistryTool>();
    for (const t of tools) map.set(t.endpointId, t);
    return map;
  }, [tools]);

  const norm = filter.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!norm) return products;
    return products
      .map(p => ({
        ...p,
        modules: p.modules
          .map(m => ({
            ...m,
            endpoints: m.endpoints.filter(e =>
              e.operationId.toLowerCase().includes(norm) ||
              e.path.toLowerCase().includes(norm) ||
              e.summary.toLowerCase().includes(norm) ||
              m.displayName.toLowerCase().includes(norm) ||
              p.displayName.toLowerCase().includes(norm),
            ),
          }))
          .filter(m => m.endpoints.length > 0),
      }))
      .filter(p => p.modules.length > 0);
  }, [products, norm]);

  // When the user is filtering, expand everything for visibility.
  const effectivelyExpanded = norm ? new Set(filtered.flatMap(p => [p.id, ...p.modules.map(m => m.id)])) : expanded;

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const realProducts = filtered.filter(isRealProduct);
  const sampleProducts = filtered.filter(p => !isRealProduct(p));

  return (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-7 text-xs"
            placeholder="Filter endpoints, modules, products..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Filter size={11} /> {filtered.reduce((n, p) => n + p.modules.reduce((mm, m) => mm + m.endpoints.length, 0), 0)} endpoints
          </span>
          <span>tap to expand</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-1">
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-slate-500">No endpoints match "{norm}".</p>
        )}

        {realProducts.length > 0 && (
          <TreeSection
            label="Real (OpenAPI sources)"
            kind="real"
            products={realProducts}
            expanded={effectivelyExpanded}
            toggle={toggle}
            toolByEndpoint={toolByEndpoint}
            selectedEndpointId={selectedEndpointId}
            navigate={navigate}
          />
        )}

        {sampleProducts.length > 0 && (
          <TreeSection
            label="Sample data"
            kind="sample"
            products={sampleProducts}
            expanded={effectivelyExpanded}
            toggle={toggle}
            toolByEndpoint={toolByEndpoint}
            selectedEndpointId={selectedEndpointId}
            navigate={navigate}
          />
        )}
      </div>

      <div className="border-t border-slate-200 p-3 text-[10px] text-slate-500">
        <div className="font-semibold uppercase tracking-wider text-slate-400">Legend</div>
        <div className="mt-1 flex items-center gap-1.5">
          <Badge tone="info">Real</Badge> <span>imported from OpenAPI</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <Badge tone="warning">Sample</Badge> <span>bundled demo data</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> Published tool
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" /> In review
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300" /> Draft tool
        </div>
      </div>
    </div>
  );
}

interface SectionProps {
  label: string;
  kind: 'real' | 'sample';
  products: Product[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  toolByEndpoint: Map<string, RegistryTool>;
  selectedEndpointId: string | undefined;
  navigate: ReturnType<typeof useNavigate>;
}

function TreeSection({ label, kind, products, expanded, toggle, toolByEndpoint, selectedEndpointId, navigate }: SectionProps) {
  return (
    <div className="mb-2">
      <div className="mt-2 flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <span>{label}</span>
        <Badge tone={kind === 'real' ? 'info' : 'warning'}>{kind === 'real' ? 'Real' : 'Sample'}</Badge>
      </div>
      {products.map(p => {
        const isOpen = expanded.has(p.id);
        return (
          <div key={p.id} className="rounded-md">
            <button
              type="button"
              onClick={() => toggle(p.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
              <ProductIcon product={p} size={12} />
              <span className="flex-1">{p.displayName}</span>
              <Badge tone={kind === 'real' ? 'info' : 'warning'}>{kind === 'real' ? 'Real' : 'Sample'}</Badge>
              <StabilityBadge stability={p.stability} />
            </button>
            {isOpen && (
              <div className="ml-4 border-l border-slate-200 pl-2">
                {p.modules.map(m => {
                  const modOpen = expanded.has(m.id);
                  return (
                    <div key={m.id}>
                      <button
                        type="button"
                        onClick={() => toggle(m.id)}
                        className="mt-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {modOpen ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                        <span className="flex-1">{m.displayName}</span>
                        <span className="text-[10px] text-slate-400">{m.endpoints.length}</span>
                      </button>
                      {modOpen && (
                        <ul className="ml-3 border-l border-slate-200 pl-1.5">
                          {m.endpoints.map(e => {
                            const tool = toolByEndpoint.get(e.id);
                            const isSelected = e.id === selectedEndpointId;
                            return (
                              <li key={e.id}>
                                <button
                                  type="button"
                                  onClick={() => navigate(`/api-catalog/endpoints/${e.id}`)}
                                  className={clsx(
                                    'mt-0.5 flex w-full items-start gap-1.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-50',
                                    isSelected && 'bg-brand-50 ring-1 ring-brand-200',
                                  )}
                                >
                                  <MethodBadge method={e.method} />
                                  <span className="flex-1 leading-tight">
                                    <span className="block font-mono text-[11px] text-slate-700">{e.path}</span>
                                    <span className={clsx('mt-0.5 block text-[10px]', isSelected ? 'text-brand-700' : 'text-slate-500')}>
                                      {e.summary}
                                    </span>
                                  </span>
                                  {tool && (
                                    <span
                                      title={`Tool: ${tool.toolName} (${tool.status})`}
                                      className={clsx(
                                        'mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                                        tool.status === 'Published' ? 'bg-emerald-500' : tool.status === 'InReview' ? 'bg-amber-500' : 'bg-slate-300',
                                      )}
                                    />
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
