import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Compass, FileJson2, Library, Plus } from 'lucide-react';
import clsx from 'clsx';
import Badge from '../../components/Badge';
import ApiStandardsDrawer from './ApiStandardsDrawer';
import { catalogApi } from '../../services/api';

/**
 * API Catalog shell.
 *
 * Tabs: Endpoints (default) · Sources.
 *
 * "Import Standards" used to be a third tab, but it's reference content rather than a
 * daily workflow surface — it now lives in a right-side drawer reachable from the
 * header action "API Standards" and from an inline link in the Sources tab. Keeps the
 * main catalog focused on browsing, source management, and tool configuration.
 *
 * The Endpoints tab is the only tab that needs the Product → Module → Endpoint tree;
 * it implements its own layout. Sources uses the normal page padding.
 */

const TABS = [
  { to: 'endpoints', label: 'Endpoints', hint: 'Product → Module → Endpoint tree from real OpenAPI sources' },
  { to: 'sources',   label: 'Sources',   hint: 'Manage the OpenAPI documents that feed the catalog' },
] as const;

/** Outlet context shape exposed to child routes (currently SourcesTab uses it). */
export interface ApiCatalogContext {
  openStandards: () => void;
}

export default function ApiCatalogPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useSearchParams();
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: () => catalogApi.getCatalog() });
  const seededFallback = !!catalog.data?.seededFallback;

  const [standardsOpen, setStandardsOpen] = useState(false);

  // Deep-link / back-compat: opening with `?standards=1` auto-opens the drawer and
  // strips the param so the URL stays clean once the user navigates further.
  useEffect(() => {
    if (search.get('standards') === '1') {
      setStandardsOpen(true);
      const next = new URLSearchParams(search);
      next.delete('standards');
      setSearch(next, { replace: true });
    }
  }, [search, setSearch]);

  const openStandards = useCallback(() => setStandardsOpen(true), []);
  const closeStandards = useCallback(() => setStandardsOpen(false), []);

  // The Endpoints tab uses a full-bleed two-column layout (tree + detail) and supplies
  // its own scroll container. Sources uses the normal page padding.
  const isEndpoints = /\/api-catalog\/endpoints(\/|$)/.test(location.pathname) || location.pathname === '/api-catalog' || location.pathname === '/api-catalog/';

  const outletContext: ApiCatalogContext = { openStandards };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-8 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
              <Library size={14} /> Catalog
            </div>
            <h1 className="mt-0.5 text-xl font-semibold text-slate-900">API Catalog</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Browse <strong>Product → Module → Endpoint</strong> from real OpenAPI sources, then configure, test, and publish endpoints as AI tools.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={openStandards}
              title="How teams make APIs available for AI tools"
            >
              <BookOpen size={14} /> API Standards
            </button>
            <button
              type="button"
              className="btn-ghost cursor-not-allowed opacity-60"
              disabled
              title="Coming later: auto-discover OpenAPI sources from the Standalone Gateway catalog."
            >
              <Compass size={14} /> Discover from Gateway
              <Badge tone="neutral" className="ml-1">coming later</Badge>
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => navigate('/api-catalog/sources?new=1')}
              title="Register an OpenAPI 3 JSON source"
            >
              <Plus size={14} /> Register Source
            </button>
          </div>
        </div>

        {seededFallback && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            <Badge tone="warning">Sample data</Badge>
            <span>
              No real OpenAPI source is registered yet. The catalog below is the Marketing sample only —{' '}
              <Link to="/api-catalog/sources" className="font-medium underline">register a source</Link>{' '}
              or{' '}
              <button type="button" className="font-medium underline" onClick={openStandards}>view API Standards</button>{' '}
              to see what teams should publish.
            </span>
          </div>
        )}

        <nav className="mt-4 -mb-px flex gap-1 border-b-0">
          {TABS.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              end={false}
              title={t.hint}
              className={({ isActive }) =>
                clsx(
                  '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'border-brand-500 text-brand-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800',
                )
              }
            >
              {t.label === 'Sources' && <FileJson2 size={13} />}
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className={isEndpoints ? 'flex-1 overflow-hidden' : 'flex-1 overflow-auto bg-slate-50'}>
        <Outlet context={outletContext} />
      </main>

      <ApiStandardsDrawer open={standardsOpen} onClose={closeStandards} />
    </div>
  );
}
