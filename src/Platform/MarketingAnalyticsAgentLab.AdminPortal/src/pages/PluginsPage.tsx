import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import PageHeader from '../components/PageHeader';
import StatusPill from '../components/StatusPill';
import { api, type PluginStatus } from '../lib/platform';

const filters: (PluginStatus | 'All')[] = ['All', 'Draft', 'Testing', 'Published', 'Disabled'];

export default function PluginsPage() {
  const [filter, setFilter] = useState<PluginStatus | 'All'>('All');
  const plugins = useQuery({
    queryKey: ['plugins', filter],
    queryFn: () => api.listPlugins(filter === 'All' ? undefined : filter),
  });

  return (
    <>
      <PageHeader
        title="Plugins"
        subtitle="Configured groupings of OpenAPI operations exposed as MCP tools to agents, with their own policies and permissions."
        actions={
          <div className="flex gap-1">
            {filters.map(f => (
              <button
                key={f}
                className={`pill ${filter === f ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        }
      />
      <div className="space-y-2 p-8">
        {plugins.data?.map(p => (
          <Link key={p.id} to={`/plugins/${p.id}`} className="card flex items-center justify-between px-5 py-3 hover:bg-slate-50">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-900">{p.displayName}</span>
                <StatusPill status={p.status} />
              </div>
              <div className="mt-1 text-xs text-slate-500">{p.description}</div>
              <div className="mt-1 font-mono text-xs text-slate-400">{p.endpoints.length} endpoints</div>
            </div>
          </Link>
        ))}
        {plugins.data?.length === 0 && (
          <p className="text-sm text-slate-500">No plugins yet. Go to APIs and create one from an imported spec.</p>
        )}
      </div>
    </>
  );
}
