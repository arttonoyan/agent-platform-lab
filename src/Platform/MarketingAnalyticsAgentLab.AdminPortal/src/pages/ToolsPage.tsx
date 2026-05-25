import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Bot,
  Compass,
  ListTree,
  Plus,
  RefreshCw,
  Server,
  Wrench,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import Tabs, { type TabSpec } from '../components/Tabs';
import ApiStandardsDrawer from '../components/ApiStandardsDrawer';
import RegisterSourceModal from '../components/RegisterSourceModal';
import ToolSetsTab from '../components/tools/ToolSetsTab';
import EndpointsTab from '../components/tools/EndpointsTab';
import SourcesTab from '../components/tools/SourcesTab';
import { api, type ApiOperation, type ApiSpecSummary, type PluginDefinition } from '../lib/platform';
import { buildEndpointRows, buildSampleEndpointRows } from '../lib/catalog';

type ToolsTabId = 'tool-sets' | 'endpoints' | 'sources';
const VALID_TABS: ToolsTabId[] = ['tool-sets', 'endpoints', 'sources'];

/**
 * Unified Tools section. Replaces the old separate "API Catalog" + "Tools" pages with
 * a single workspace that owns the full tool creation lifecycle:
 *
 *   API Sources → Endpoints → Tool Sets
 *
 * Default tab is "Tool Sets" — published/governed AI tools are the main product
 * object users come here for. Endpoints and API Sources support tool creation.
 *
 * Header CTA + Standards drawer behave the same as the old API Catalog: register a
 * new OpenAPI source, or open the standards reference for API teams.
 */
export default function ToolsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const tabFromUrl = (params.get('tab') as ToolsTabId) ?? 'tool-sets';
  const tab: ToolsTabId = VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'tool-sets';

  function setTab(next: ToolsTabId) {
    setParams(prev => {
      const newParams = new URLSearchParams(prev);
      if (next === 'tool-sets') newParams.delete('tab');
      else newParams.set('tab', next);
      return newParams;
    });
  }

  const [registerOpen, setRegisterOpen] = useState(false);
  const [standardsOpen, setStandardsOpen] = useState(false);

  // Header cards work off the same data the tabs use; we fetch once at the top so
  // every tab reads from the warmed React Query cache.
  const apisQuery = useQuery({ queryKey: ['apis'], queryFn: () => api.listApiSpecs() });
  const pluginsQuery = useQuery({ queryKey: ['plugins', 'all'], queryFn: () => api.listPlugins() });
  const agentsQuery = useQuery({ queryKey: ['agents'], queryFn: () => api.listAgents() });

  const specs: ApiSpecSummary[] = apisQuery.data ?? [];
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
  const agents = agentsQuery.data ?? [];

  const agentsByPluginId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of agents) for (const pid of a.pluginIds) map[pid] = (map[pid] ?? 0) + 1;
    return map;
  }, [agents]);

  const importedRows = useMemo(
    () => buildEndpointRows({ specs, operationsBySpec, plugins, agentsByPluginId }),
    [specs, operationsBySpec, plugins, agentsByPluginId],
  );
  const sampleRows = useMemo(() => buildSampleEndpointRows(), []);
  const hasImportedRows = importedRows.length > 0;
  const totalEndpoints = hasImportedRows ? importedRows.length : sampleRows.length;

  const publishedToolSetCount = plugins.filter(p => p.status === 'Published').length;
  const agentsUsingTools = agents.filter(a => a.pluginIds.length > 0).length;

  const lastImportLabel = useMemo(() => {
    if (specs.length === 0) return 'No source registered yet';
    const max = specs.reduce((acc, s) => (s.importedAt > acc ? s.importedAt : acc), specs[0].importedAt);
    return new Date(max).toLocaleString();
  }, [specs]);

  const tabs: TabSpec<ToolsTabId>[] = [
    { id: 'tool-sets', label: 'Tool Sets', count: plugins.length },
    { id: 'endpoints', label: 'Endpoints', count: totalEndpoints },
    { id: 'sources',   label: 'API Sources', count: specs.length },
  ];

  return (
    <>
      <PageHeader
        title="Tools"
        subtitle="Create governed AI tools from internal APIs. Register sources, pick endpoints, group them into Tool Sets, then publish so agents can use them."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setStandardsOpen(true)}
              title="Conventions an OpenAPI source must follow to register cleanly"
            >
              <BookOpen size={14} /> API Standards
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled
              title="Auto-discover OpenAPI sources from the platform Gateway. Coming later."
            >
              <Compass size={14} /> Discover from Gateway
              <span className="pill ml-1 bg-slate-100 text-slate-500">coming later</span>
            </button>
            <button type="button" className="btn" onClick={() => setRegisterOpen(true)}>
              <Plus size={14} /> Register Source
            </button>
          </div>
        }
      />

      <div className="space-y-6 p-8">
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            label="Tool Sets"
            value={plugins.length.toLocaleString()}
            hint={`${publishedToolSetCount} published`}
            icon={Wrench}
            tone={publishedToolSetCount > 0 ? 'good' : 'default'}
          />
          <MetricCard
            label="Endpoints"
            value={totalEndpoints.toLocaleString()}
            hint={hasImportedRows ? 'across all sources' : 'sample data — register a source'}
            icon={ListTree}
          />
          <MetricCard
            label="API sources"
            value={specs.length.toLocaleString()}
            hint={
              specs.length === 0
                ? 'No source registered'
                : `${specs.length === 1 ? '1 OpenAPI doc' : `${specs.length} OpenAPI docs`} indexed`
            }
            icon={Server}
          />
          <MetricCard
            label="Agents using tools"
            value={agentsUsingTools.toLocaleString()}
            hint={`${agents.length} ${agents.length === 1 ? 'agent' : 'agents'} configured`}
            icon={Bot}
          />
          <MetricCard
            label="Last import"
            value={specs.length === 0 ? '—' : timeAgo(latestImportedAt(specs))}
            hint={lastImportLabel}
            icon={RefreshCw}
          />
        </section>

        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === 'tool-sets' && <ToolSetsTab />}
        {tab === 'endpoints' && <EndpointsTab />}
        {tab === 'sources' && <SourcesTab onRegisterClick={() => setRegisterOpen(true)} />}
      </div>

      <ApiStandardsDrawer open={standardsOpen} onClose={() => setStandardsOpen(false)} />
      <RegisterSourceModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onRegistered={() => {
          qc.invalidateQueries({ queryKey: ['apis'] });
          // Land the user on the Sources tab so they can see what they just added,
          // and the catalog reload kicks the Endpoints + Tool Sets counts.
          navigate('/tools?tab=sources', { replace: true });
        }}
      />
    </>
  );
}

function latestImportedAt(specs: { importedAt: string }[]): string {
  return specs.reduce((acc, s) => (s.importedAt > acc ? s.importedAt : acc), specs[0].importedAt);
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
