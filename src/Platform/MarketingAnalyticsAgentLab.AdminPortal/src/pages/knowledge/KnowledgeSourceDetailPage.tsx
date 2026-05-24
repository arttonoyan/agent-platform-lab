import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Database, RefreshCcw } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import Badge from '../../components/Badge';
import { KnowledgeStatusBadge } from '../../components/StatusBadge';
import JsonBlock from '../../components/JsonBlock';
import DataTable, { type Column } from '../../components/DataTable';
import { knowledgeApi } from '../../services/api';
import type { IngestionSource } from '../../data/types';

export default function KnowledgeSourceDetailPage() {
  const { knowledgeId = '' } = useParams();
  const ks = useQuery({ queryKey: ['knowledge', knowledgeId], queryFn: () => knowledgeApi.get(knowledgeId), enabled: !!knowledgeId });

  if (!ks.data) return <div className="p-8 text-sm text-slate-500">Loading collection…</div>;

  const k = ks.data;

  const ingestionColumns: Column<IngestionSource>[] = [
    { key: 'kind',      header: 'Kind',          render: r => <Badge tone="brand" mono>{r.kind}</Badge> },
    { key: 'label',     header: 'Source',        render: r => <span className="text-slate-800">{r.label}</span> },
    { key: 'location',  header: 'Location',      render: r => <span className="font-mono text-xs text-slate-600">{r.location}</span> },
    { key: 'docs',      header: 'Docs',          render: r => <span className="tabular-nums">{r.documentCount.toLocaleString()}</span>, align: 'right' },
    { key: 'lastSync',  header: 'Last sync',     render: r => <span className="text-xs text-slate-600">{new Date(r.lastSyncAt).toLocaleString()}</span> },
  ];

  return (
    <>
      <PageHeader
        title={k.displayName}
        subtitle={k.description}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/knowledge" className="btn-ghost"><ArrowLeft size={14} /> All collections</Link>
            <button className="btn"><RefreshCcw size={14} /> Re-index</button>
          </div>
        }
      />

      <div className="grid gap-6 p-8 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
          <section className="card">
            <div className="card-header">Ingestion sources</div>
            <DataTable rows={k.ingestionSources} columns={ingestionColumns} rowKey={r => r.id} className="rounded-none border-0 shadow-none" />
          </section>

          <section className="card">
            <div className="card-header">Sample vector record</div>
            <div className="p-4">
              <JsonBlock
                value={{
                  id: 'chunk_3a1e9f',
                  collection: k.collectionName,
                  metadata: {
                    productId: k.productId,
                    documentId: 'doc_142',
                    source: k.ingestionSources[0]?.label ?? '—',
                    chunkIndex: 4,
                  },
                  text: '"Send-time optimisation: subject A/B with concrete dollar amounts, prefer Tue 09:30 local..." (truncated)',
                  embedding: '[3072 floats]',
                  embeddingModel: k.embeddingModel,
                }}
                language="json"
                maxHeight="18rem"
              />
              <p className="mt-2 text-[11px] text-slate-500">
                Records on {k.vectorProvider === 'qdrant' ? 'Qdrant' : 'pgvector'} are accessed through the same
                <span className="font-mono"> VectorStoreCollectionSearch </span> abstraction defined by{' '}
                <span className="font-mono">Microsoft.Extensions.VectorData</span>.
              </p>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <div className="section-title">Collection</div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="Status"           value={<KnowledgeStatusBadge status={k.status} />} />
              <Row label="Provider"         value={<Badge tone={k.vectorProvider === 'qdrant' ? 'purple' : 'info'}>{k.vectorProvider}</Badge>} />
              <Row label="Collection name"  value={<span className="font-mono text-xs text-slate-800">{k.collectionName}</span>} />
              <Row label="Owner"            value={k.owner} />
              <Row label="Documents"        value={<span className="tabular-nums">{k.documentCount.toLocaleString()}</span>} />
              <Row label="Chunks"           value={<span className="tabular-nums">{k.chunkCount.toLocaleString()}</span>} />
              <Row label="Last indexed"     value={<span className="text-xs">{new Date(k.lastIndexedAt).toLocaleString()}</span>} />
            </dl>
          </section>

          <section className="card p-5">
            <div className="section-title">Embedding</div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="Model"        value={<span className="font-mono text-xs">{k.embeddingModel}</span>} />
              <Row label="Dimensions"   value={<span className="font-mono text-xs">{k.embeddingDimensions}</span>} />
            </dl>
          </section>

          <section className="card p-5">
            <div className="section-title">Retrieval</div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="Top-K"        value={k.retrievalConfig.topK} />
              <Row label="Similarity ≥" value={k.retrievalConfig.similarityThreshold} />
              <Row label="Rerank"       value={k.retrievalConfig.rerank ? <Badge tone="success">on</Badge> : <Badge tone="neutral">off</Badge>} />
            </dl>
          </section>

          <section className="card p-5">
            <div className="section-title">Used by agents</div>
            {k.usedByAgents.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">Not attached to any agent yet.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {k.usedByAgents.map(name => (
                  <Badge key={name} tone="brand" mono><Database size={11} /> {name}</Badge>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}
