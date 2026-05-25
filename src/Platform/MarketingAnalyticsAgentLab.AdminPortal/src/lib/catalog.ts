import type { ApiOperation, ApiSpecSummary, PluginDefinition } from './platform';

/**
 * Static catalog metadata.
 *
 * The PluginRegistry only knows the OpenAPI document - it doesn't know which "product"
 * (Marketing / Fleet / Field Ops / ...) or "module" (Analytics / Campaigns / ...) a
 * given source belongs to. The Admin Portal owns that classification today by mapping
 * the registered serviceName onto a curated entry below. This is intentionally a UI
 * convention, not a backend concern - the moment we add an `x-st-product` extension to
 * each OpenAPI doc we replace this lookup with a parser over `ApiOperation.tags`.
 */
export interface ServiceCatalogEntry {
  serviceName: string;
  product: string;
  productDisplay: string;
  module: string;
  moduleDisplay: string;
  ownerTeam: string;
  /** Default openApi URL hint used by the Register Source modal. */
  openApiUrl?: string;
}

export const SERVICE_CATALOG: Record<string, ServiceCatalogEntry> = {
  'analytics-api': {
    serviceName: 'analytics-api',
    product: 'marketing',
    productDisplay: 'Marketing',
    module: 'analytics',
    moduleDisplay: 'Marketing Analytics',
    ownerTeam: 'Marketing Platform Team',
  },
  'campaigns-api': {
    serviceName: 'campaigns-api',
    product: 'marketing',
    productDisplay: 'Marketing',
    module: 'campaigns',
    moduleDisplay: 'Campaign Management',
    ownerTeam: 'Marketing Platform Team',
  },
  'customers-api': {
    serviceName: 'customers-api',
    product: 'marketing',
    productDisplay: 'Marketing',
    module: 'customers',
    moduleDisplay: 'Customer Insights',
    ownerTeam: 'Marketing Platform Team',
  },
  'notification-api': {
    serviceName: 'notification-api',
    product: 'marketing',
    productDisplay: 'Marketing',
    module: 'notifications',
    moduleDisplay: 'Notifications',
    ownerTeam: 'Marketing Platform Team',
  },
};

/**
 * Falls back to a "Other / serviceName" classification when a registered source has no
 * curated entry above. The product display is title-cased so the UI never shows raw
 * service names like `fleet-api`.
 */
export function classifyService(serviceName: string): ServiceCatalogEntry {
  const known = SERVICE_CATALOG[serviceName];
  if (known) return known;
  const cleaned = serviceName.replace(/-api$/, '').replace(/-/g, ' ');
  const titled = cleaned.replace(/\b\w/g, c => c.toUpperCase());
  return {
    serviceName,
    product: 'other',
    productDisplay: 'Other',
    module: serviceName,
    moduleDisplay: titled || serviceName,
    ownerTeam: 'Unassigned',
  };
}

// ---------------------------------------------------------------------------
// Endpoint catalog row - flat shape consumed by the Endpoints tab
// ---------------------------------------------------------------------------

export type ToolLifecycle = 'not-configured' | 'draft' | 'published';
export type EndpointSource = 'imported' | 'sample';

export interface CatalogEndpointRow {
  /** Synthetic id: `${specId}::${operationId}` for imported, `sample::${id}` for sample. */
  id: string;
  source: EndpointSource;
  /** Specification (real OpenAPI source) id. Undefined for sample rows. */
  specId?: string;
  serviceName: string;
  sourceDisplay: string;
  operationId: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  product: string;
  productDisplay: string;
  module: string;
  moduleDisplay: string;
  toolStatus: ToolLifecycle;
  toolName?: string;
  pluginId?: string;
  pluginName?: string;
  agentsUsing: number;
  /** Marker so the UI can disable execution of write methods at MVP. */
  isWrite: boolean;
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const isWriteMethod = (method: string) => WRITE_METHODS.has(method.toUpperCase());

interface BuildArgs {
  specs: ApiSpecSummary[];
  operationsBySpec: Record<string, ApiOperation[] | undefined>;
  plugins: PluginDefinition[];
  agentsByPluginId: Record<string, number>;
}

/**
 * Joins specs + their operations + tool-set definitions into a flat list of catalog rows.
 * Handles the "endpoint already wrapped as a tool" lookup inline so the UI can render
 * status pills without re-walking the plugin list.
 */
export function buildEndpointRows({
  specs,
  operationsBySpec,
  plugins,
  agentsByPluginId,
}: BuildArgs): CatalogEndpointRow[] {
  const rows: CatalogEndpointRow[] = [];
  for (const spec of specs) {
    const meta = classifyService(spec.serviceName);
    const ops = operationsBySpec[spec.id] ?? [];
    for (const op of ops) {
      const owningPlugin = plugins.find(
        p => p.apiSpecId === spec.id && p.endpoints.some(e => e.operationId === op.operationId),
      );
      const matchingEndpoint = owningPlugin?.endpoints.find(e => e.operationId === op.operationId);
      const toolStatus: ToolLifecycle = !owningPlugin
        ? 'not-configured'
        : owningPlugin.status === 'Published'
          ? 'published'
          : 'draft';
      rows.push({
        id: `${spec.id}::${op.operationId}`,
        source: 'imported',
        specId: spec.id,
        serviceName: spec.serviceName,
        sourceDisplay: spec.displayName,
        operationId: op.operationId,
        method: op.method,
        path: op.path,
        summary: op.summary,
        description: op.description,
        product: meta.product,
        productDisplay: meta.productDisplay,
        module: meta.module,
        moduleDisplay: meta.moduleDisplay,
        toolStatus,
        toolName: matchingEndpoint?.toolName,
        pluginId: owningPlugin?.id,
        pluginName: owningPlugin?.displayName,
        agentsUsing: owningPlugin ? agentsByPluginId[owningPlugin.id] ?? 0 : 0,
        isWrite: isWriteMethod(op.method),
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Sample / seed catalog - shown when no OpenAPI source has been registered yet
// ---------------------------------------------------------------------------

export interface SampleEndpointSeed {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  product: string;
  productDisplay: string;
  module: string;
  moduleDisplay: string;
  serviceName: string;
  sourceDisplay: string;
}

const SAMPLE_SEEDS: SampleEndpointSeed[] = [
  {
    operationId: 'GetEmailDeliveryReport',
    method: 'GET',
    path: '/analytics/email-delivery',
    summary: 'Email delivery report',
    description: 'Returns sent / delivered / bounced counts for the trailing N days.',
    product: 'marketing',
    productDisplay: 'Marketing',
    module: 'analytics',
    moduleDisplay: 'Marketing Analytics',
    serviceName: 'analytics-api',
    sourceDisplay: 'Marketing Analytics API (sample)',
  },
  {
    operationId: 'GetOpenRateReport',
    method: 'GET',
    path: '/analytics/open-rate',
    summary: 'Open rate report',
    description: 'Overall open rate and daily series for the trailing N days.',
    product: 'marketing',
    productDisplay: 'Marketing',
    module: 'analytics',
    moduleDisplay: 'Marketing Analytics',
    serviceName: 'analytics-api',
    sourceDisplay: 'Marketing Analytics API (sample)',
  },
  {
    operationId: 'GetClickThroughReport',
    method: 'GET',
    path: '/analytics/click-through',
    summary: 'Click-through-rate report',
    description: 'Click-through rate and daily series for the trailing N days.',
    product: 'marketing',
    productDisplay: 'Marketing',
    module: 'analytics',
    moduleDisplay: 'Marketing Analytics',
    serviceName: 'analytics-api',
    sourceDisplay: 'Marketing Analytics API (sample)',
  },
  {
    operationId: 'ListCampaigns',
    method: 'GET',
    path: '/campaigns',
    summary: 'List campaigns',
    description: 'Paged list of campaigns filtered by status and audience.',
    product: 'marketing',
    productDisplay: 'Marketing',
    module: 'campaigns',
    moduleDisplay: 'Campaign Management',
    serviceName: 'campaigns-api',
    sourceDisplay: 'Campaign Management API (sample)',
  },
  {
    operationId: 'SendCampaign',
    method: 'POST',
    path: '/campaigns/{campaignId}/send',
    summary: 'Send a campaign',
    description: 'Send a campaign to its current audience. Use dryRun=true to preview.',
    product: 'marketing',
    productDisplay: 'Marketing',
    module: 'campaigns',
    moduleDisplay: 'Campaign Management',
    serviceName: 'campaigns-api',
    sourceDisplay: 'Campaign Management API (sample)',
  },
];

export function buildSampleEndpointRows(): CatalogEndpointRow[] {
  return SAMPLE_SEEDS.map(seed => ({
    id: `sample::${seed.serviceName}::${seed.operationId}`,
    source: 'sample',
    serviceName: seed.serviceName,
    sourceDisplay: seed.sourceDisplay,
    operationId: seed.operationId,
    method: seed.method,
    path: seed.path,
    summary: seed.summary,
    description: seed.description,
    product: seed.product,
    productDisplay: seed.productDisplay,
    module: seed.module,
    moduleDisplay: seed.moduleDisplay,
    toolStatus: 'not-configured',
    agentsUsing: 0,
    isWrite: isWriteMethod(seed.method),
  }));
}
