import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Database, Plus, Search } from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import MetricCard from '../../components/MetricCard';
import { KnowledgeStatusBadge } from '../../components/StatusBadge';
import { knowledgeApi } from '../../services/api';
import type { VectorProvider } from '../../data/types';

const providerLabel: Record<VectorProvider, string> = {
  qdrant:   'Qdrant',
  pgvector: 'pgvector',
};

export default function KnowledgeSourcesPage() {
  const knowledge = useQuery({ queryKey: ['knowledge'], queryFn: () => knowledgeApi.list() });
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState<'all' | VectorProvider>('all');

  const rows = useMemo(() => {
    const all = knowledge.data ?? [];
    const f = provider === 'all' ? all : all.filter(k => k.vectorProvider === provider);
    const q = query.trim().toLowerCase();
    if (!q) return f;
    return f.filter(k =>
      k.displayName.toLowerCase().includes(q) ||
      k.description.toLowerCase().includes(q) ||
      k.collectionName.toLowerCase().includes(q),
    );
  }, [knowledge.data, provider, query]);

  const totals = useMemo(() => {
    const all = knowledge.data ?? [];
    return {
      total: all.length,
      qdrant: all.filter(k => k.vectorProvider === 'qdrant').length,
      pgvector: all.filter(k => k.vectorProvider === 'pgvector').length,
      chunks: all.reduce((s, k) => s + k.chunkCount, 0),
      docs: all.reduce((s, k) => s + k.documentCount, 0),
    };
  }, [knowledge.data]);

  return (
    <>
      <PageHeader
        title="Knowledge Sources"
        subtitle="Vector collections accessed through Microsoft.Extensions.VectorData. Qdrant is the preferred platform-scale provider; pgvector is the lightweight per-product / local option."
        actions={
          <button className="btn" disabled>
            <Plus size={14} /> New collection
          </button>
        }
      />

      <div className="space-y-6 p-8">
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Collections"     value={totals.total} Icon={Database} hint={`${totals.qdrant} Qdrant · ${totals.pgvector} pgvector`} />
          <MetricCard label="Documents"       value={totals.docs.toLocaleString()} hint="across all ingestion sources" />
          <MetricCard label="Vector chunks"   value={totals.chunks.toLocaleString()} hint="post-chunking, post-embedding" />
          <MetricCard label="Embedding cost"  value="$3.42 / day" trend="indicative" trendTone="neutral" hint="text-embedding-3-large + small" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input w-72 pl-7" placeholder="Search collections…" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <div className="flex gap-1">
            {(['all', 'qdrant', 'pgvector'] as const).map(p => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={clsx('pill', provider === p ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
              >
                {p === 'all' ? 'All providers' : providerLabel[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {rows.map(k => (
            <Link key={k.id} to={`/knowledge/${k.id}`} className="card flex flex-col p-5 transition hover:border-brand-200 hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={clsx('rounded-md p-2', k.vectorProvider === 'qdrant' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700')}>
                    <Database size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{k.displayName}</div>
                    <div className="font-mono text-[11px] text-slate-500">{k.collectionName}</div>
                  </div>
                </div>
                <KnowledgeStatusBadge status={k.status} />
              </div>
              <p className="mt-3 text-sm text-slate-600 line-clamp-2">{k.description}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Stat label="Docs"   value={k.documentCount.toLocaleString()} />
                <Stat label="Chunks" value={k.chunkCount.toLocaleString()} />
                <Stat label="Top-K"  value={k.retrievalConfig.topK} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone={k.vectorProvider === 'qdrant' ? 'purple' : 'info'}>{providerLabel[k.vectorProvider]}</Badge>
                <Badge tone="neutral" mono>{k.embeddingModel}</Badge>
                <Badge tone="neutral">{k.embeddingDimensions}-d</Badge>
                {k.retrievalConfig.rerank && <Badge tone="success">rerank</Badge>}
              </div>
              <div className="mt-3 text-[11px] text-slate-500">
                {k.usedByAgents.length === 0 ? 'Not attached to any agent yet.' : `Attached to ${k.usedByAgents.length} agent${k.usedByAgents.length === 1 ? '' : 's'}.`}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md bg-slate-50 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-slate-800 tabular-nums">{value}</div>
    </div>
  );
}
