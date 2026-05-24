import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import MethodBadge from '../../components/MethodBadge';
import ProductIcon from '../../components/ProductIcon';
import Tabs, { type TabItem } from '../../components/Tabs';
import Badge from '../../components/Badge';
import { StabilityBadge, ToolStatusBadge, WriteSafetyBadge } from '../../components/StatusBadge';
import { catalogApi, toolsApi } from '../../services/api';
import OverviewTab from './tabs/OverviewTab';
import ToolConfigurationTab from './tabs/ToolConfigurationTab';
import PlaygroundTab from './tabs/PlaygroundTab';
import PublishTab from './tabs/PublishTab';

export type EndpointTabId = 'overview' | 'tool' | 'playground' | 'publish';

const tabs: TabItem<EndpointTabId>[] = [
  { id: 'overview',   label: 'Overview',           hint: 'Endpoint contract and metadata from OpenAPI' },
  { id: 'tool',       label: 'Tool Configuration', hint: 'Create or edit a ToolDefinition for this endpoint' },
  { id: 'playground', label: 'Playground',         hint: 'Test the ToolDefinition before publishing' },
  { id: 'publish',    label: 'Publish',            hint: 'Promote to the Tool & Agent Registry' },
];

export default function EndpointDetailPage() {
  const { endpointId = '' } = useParams();
  const [tab, setTab] = useState<EndpointTabId>('overview');

  const endpointQuery = useQuery({
    queryKey: ['endpoint', endpointId],
    queryFn: () => catalogApi.getEndpoint(endpointId),
    enabled: !!endpointId,
  });

  const productQuery = useQuery({
    queryKey: ['endpoint.product', endpointQuery.data?.productId],
    queryFn: () => catalogApi.getProduct(endpointQuery.data!.productId),
    enabled: !!endpointQuery.data?.productId,
  });

  const moduleQuery = useQuery({
    queryKey: ['endpoint.module', endpointQuery.data?.productId, endpointQuery.data?.moduleId],
    queryFn: () => catalogApi.getModule(endpointQuery.data!.productId, endpointQuery.data!.moduleId.split('.')[1]),
    enabled: !!endpointQuery.data?.moduleId,
  });

  const toolQuery = useQuery({
    queryKey: ['endpoint.tool', endpointId],
    queryFn: () => toolsApi.getRegistryToolByEndpoint(endpointId),
    enabled: !!endpointId,
  });

  const draftStateQuery = useQuery({
    queryKey: ['endpoint.draft', endpointId],
    queryFn: () => toolsApi.getDraftState(endpointId),
    enabled: !!endpointId,
  });

  const endpoint = endpointQuery.data;
  const product = productQuery.data;
  const module = moduleQuery.data;
  const tool = toolQuery.data;
  const draftState = draftStateQuery.data;

  const decoratedTabs = useMemo<TabItem<EndpointTabId>[]>(() => [
    tabs[0],
    tabs[1],
    { ...tabs[2], hint: draftState?.hasConfiguration ? 'Test the saved tool configuration' : 'Create a tool configuration first' },
    { ...tabs[3], hint: tool ? `Currently ${tool.status}` : 'Not yet in the registry' },
  ], [tool, draftState]);

  if (!endpoint || !product || !module) {
    return <div className="p-8 text-sm text-slate-500">Loading endpoint…</div>;
  }

  return (
    <>
      <header className="bg-white px-8 pt-6">
        <nav className="flex items-center gap-1 text-xs text-slate-500">
          <ProductIcon product={product} size={11} />
          <span>{product.displayName}</span>
          <ChevronRight size={12} className="text-slate-300" />
          <span>{module.displayName}</span>
          <ChevronRight size={12} className="text-slate-300" />
          <span className="font-mono text-slate-700">{endpoint.operationId}</span>
        </nav>

        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MethodBadge method={endpoint.method} />
              <span className="font-mono text-sm text-slate-800">{endpoint.path}</span>
            </div>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">{endpoint.summary}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">{endpoint.description}</p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {endpoint.isSeed
                ? <Badge tone="warning">Sample source</Badge>
                : <Badge tone="info">Real source · imported from OpenAPI</Badge>}
              <StabilityBadge stability={endpoint.stability} />
              <WriteSafetyBadge writeSafety={endpoint.writeSafety} />
              {endpoint.xStMetadata.pii && <Badge tone="warning">PII</Badge>}
              {tool ? <ToolStatusBadge status={tool.status} /> : <Badge tone="neutral">no tool yet</Badge>}
            </div>
            {tool && (
              <div className="text-right text-[11px] text-slate-500">
                tool <span className="font-mono">{tool.toolName}</span> v{tool.version}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <Tabs tabs={decoratedTabs} active={tab} onSelect={setTab} />
        </div>
      </header>

      <div className="p-8">
        {tab === 'overview' && (
          <OverviewTab
            endpoint={endpoint}
            product={product}
            module={module}
            tool={tool}
            hasConfiguration={!!draftState?.hasConfiguration}
            onConfigureAsTool={() => setTab('tool')}
          />
        )}
        {tab === 'tool' && (
          <ToolConfigurationTab
            endpoint={endpoint}
            draftState={draftState}
            onTestInPlayground={() => setTab('playground')}
            onPublished={() => setTab('publish')}
          />
        )}
        {tab === 'playground' && (
          <PlaygroundTab
            endpoint={endpoint}
            hasConfiguration={!!draftState?.hasConfiguration}
            onConfigureAsTool={() => setTab('tool')}
          />
        )}
        {tab === 'publish' && (
          <PublishTab
            endpoint={endpoint}
            tool={tool}
            hasConfiguration={!!draftState?.hasConfiguration}
            onConfigureAsTool={() => setTab('tool')}
            onPublished={() => setTab('overview')}
          />
        )}
      </div>
    </>
  );
}
