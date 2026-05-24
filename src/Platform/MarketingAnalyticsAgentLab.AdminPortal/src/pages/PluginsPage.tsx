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
        title="Tools"
        subtitle="Tool Sets group OpenAPI operations from one API into callable AI tools. Configure them here, then attach to agents."
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
          <Link key={p.id} to={`/tools/${p.id}`} className="card flex items-center justify-between px-5 py-3 hover:bg-slate-50">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-900">{p.displayName}</span>
                <StatusPill status={p.status} />
                <span className="pill bg-slate-100 text-slate-600">Tool Set</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{p.description}</div>
              <div className="mt-1 font-mono text-xs text-slate-400">
                {p.endpoints.length} {p.endpoints.length === 1 ? 'tool' : 'tools'}
              </div>
            </div>
          </Link>
        ))}
        {plugins.data?.length === 0 && (
          <p className="text-sm text-slate-500">No Tool Sets yet. Open <strong>APIs</strong>, pick one or more operations, and click <strong>Create Tool Set</strong>.</p>
        )}
      </div>
    </>
  );
}
