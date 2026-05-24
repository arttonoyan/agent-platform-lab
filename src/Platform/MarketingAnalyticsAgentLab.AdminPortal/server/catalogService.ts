import { products as seedProducts } from '../src/data/products';
import { buildProductFromSource, type FetchedOpenApiDocument } from './openApiClient';
import { fetchDocForSource, listSources } from './openApiSources';
import type { Endpoint, Module, OpenApiSource, Product } from './types';

/**
 * Build the unified API Catalog the React app consumes.
 *
 * Rules:
 *  - Every registered source with status=ok contributes one Product (modules grouped by tag).
 *  - When NO real source is registered, we fall back to a small bundled sample so the
 *    catalog isn't empty on first run. The MVP is scoped to Marketing, so only the
 *    Marketing seed product is exposed. Every endpoint gets `isSeed=true` so the UI can
 *    render a "Sample" badge — operators always know what's real and what's a demo.
 *  - We cache parsed docs per-process to avoid hammering upstream when the UI hits the
 *    catalog repeatedly. Cache is busted when a source is refreshed (lastFetchedAt changes).
 */

/** Sample products surfaced in the API Catalog when no real OpenAPI source is registered. */
const SEED_CATALOG_PRODUCT_IDS = new Set(['marketing']);

interface DocCacheEntry {
  lastFetchedAt: string | undefined;
  doc: FetchedOpenApiDocument;
}

const docCache = new Map<string, DocCacheEntry>();

async function ensureDoc(source: OpenApiSource): Promise<FetchedOpenApiDocument> {
  const cached = docCache.get(source.id);
  if (cached && cached.lastFetchedAt === source.lastFetchedAt) {
    return cached.doc;
  }
  const doc = await fetchDocForSource(source.id);
  docCache.set(source.id, { lastFetchedAt: source.lastFetchedAt, doc });
  return doc;
}

function stampSeed(p: Product): Product {
  return {
    ...p,
    modules: p.modules.map(m => ({
      ...m,
      endpoints: m.endpoints.map(e => ({ ...e, isSeed: true })),
    })),
  };
}

export interface CatalogResult {
  products: Product[];
  realSourceCount: number;
  seededFallback: boolean;
}

export async function buildCatalog(): Promise<CatalogResult> {
  const sources = await listSources();
  // Disabled sources are kept in the Sources tab but excluded from the live catalog so
  // their endpoints don't show up as available tools.
  const okSources = sources.filter(s => s.status === 'ok' && s.enabled !== false);

  const realProducts: Product[] = [];
  for (const source of okSources) {
    try {
      const doc = await ensureDoc(source);
      const product = buildProductFromSource(
        source.id,
        source.displayName,
        source.description,
        doc,
        source.lastFetchedAt ?? new Date().toISOString(),
      );
      realProducts.push(product);
    } catch (err) {
      // Skip a temporarily-failed source — the source remains visible in OpenAPI Sources.
      console.warn(`[mvp-bff] skipping source ${source.id} in catalog: ${(err as Error).message}`);
    }
  }

  if (realProducts.length > 0) {
    return { products: realProducts, realSourceCount: realProducts.length, seededFallback: false };
  }

  // Fallback: a small bundled sample (Marketing only) so the demo is immediately useful.
  return {
    products: seedProducts.filter(p => SEED_CATALOG_PRODUCT_IDS.has(p.id)).map(stampSeed),
    realSourceCount: 0,
    seededFallback: true,
  };
}

export async function getProduct(productId: string): Promise<Product | undefined> {
  const { products } = await buildCatalog();
  return products.find(p => p.id === productId);
}

export async function getModule(productId: string, moduleName: string): Promise<Module | undefined> {
  return (await getProduct(productId))?.modules.find(m => m.name === moduleName);
}

export async function getEndpoint(endpointId: string): Promise<Endpoint | undefined> {
  const { products } = await buildCatalog();
  for (const p of products) {
    for (const m of p.modules) {
      const e = m.endpoints.find(x => x.id === endpointId);
      if (e) return e;
    }
  }
  return undefined;
}
