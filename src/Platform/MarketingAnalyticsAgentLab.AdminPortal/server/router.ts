import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildCatalog, getEndpoint, getModule, getProduct } from './catalogService';
import { listExecutions, getExecution, listAuditEvents } from './auditService';
import { deleteSource, fetchDocForSource, getSource, listSources, refreshSource, registerSource, updateSource } from './openApiSources';
import {
  findToolByEndpoint,
  getOrCreateConfiguration,
  getToolDraftState,
  listEndpointsWithoutTools,
  listRegistryTools,
  publishTool,
  saveConfiguration,
  setToolStatus,
} from './toolService';
import { runTool } from './toolRunner';
import { agents as seedAgents } from '../src/data/agents';
import { knowledgeSources } from '../src/data/knowledge';
import { gatewayAssistants, gatewayPolicies, gatewayRateLimits, recentInvocations } from '../src/data/gateway';
import { computeMetrics } from '../src/data/metrics';
import type { AgentDefinition, RegisterOpenApiSourceRequest, RunToolRequest, ToolConfiguration, ToolStatus, UpdateOpenApiSourceRequest } from './types';

/**
 * Minimal request router under /api/*.
 *
 * Hand-rolled to keep deps zero. Pattern matching is explicit and easy to read; if the
 * platform grows past ~30 routes consider swapping for Hono/itty/express.
 */

type RouteHandler = (ctx: RouteCtx) => Promise<void> | void;
interface RouteCtx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  body: () => Promise<unknown>;
}

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

const routes: Route[] = [];

function add(method: string, path: string, handler: RouteHandler): void {
  const paramNames: string[] = [];
  const regex = new RegExp(
    '^' +
      path
        .replace(/[.*+?^${}()|[\]\\]/g, m => (m === ':' || m === '/' ? m : `\\${m}`))
        .replace(/:([a-zA-Z_]+)/g, (_, n) => {
          paramNames.push(n);
          return '([^/]+)';
        }) +
      '$',
  );
  routes.push({ method, pattern: regex, paramNames, handler });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve(undefined);
      try {
        resolve(JSON.parse(text));
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${(err as Error).message}`));
      }
    });
    req.on('error', reject);
  });
}

// -------------------------------------------------------------------------------------
// Health
// -------------------------------------------------------------------------------------

add('GET', '/api/health', ({ res }) => {
  send(res, 200, { ok: true, mode: 'mvp-bff', startedAt: new Date().toISOString() });
});

// -------------------------------------------------------------------------------------
// OpenAPI Sources
// -------------------------------------------------------------------------------------

add('GET', '/api/openapi/sources', async ({ res }) => {
  send(res, 200, await listSources());
});

add('POST', '/api/openapi/sources', async ({ res, body }) => {
  const payload = (await body()) as RegisterOpenApiSourceRequest;
  const source = await registerSource(payload);
  send(res, 201, source);
});

add('GET', '/api/openapi/sources/:id', async ({ res, params }) => {
  const source = await getSource(params.id);
  if (!source) return send(res, 404, { error: 'not_found' });
  send(res, 200, source);
});

add('PUT', '/api/openapi/sources/:id', async ({ res, params, body }) => {
  const patch = (await body()) as UpdateOpenApiSourceRequest;
  const updated = await updateSource(params.id, patch);
  send(res, 200, updated);
});

add('DELETE', '/api/openapi/sources/:id', async ({ res, params }) => {
  const ok = await deleteSource(params.id);
  send(res, ok ? 204 : 404, ok ? null : { error: 'not_found' });
});

add('POST', '/api/openapi/sources/:id/refresh', async ({ res, params }) => {
  const updated = await refreshSource(params.id);
  send(res, 200, updated);
});

add('GET', '/api/openapi/sources/:id/document', async ({ res, params }) => {
  const doc = await fetchDocForSource(params.id);
  send(res, 200, doc);
});

// -------------------------------------------------------------------------------------
// Catalog
// -------------------------------------------------------------------------------------

add('GET', '/api/catalog', async ({ res }) => {
  send(res, 200, await buildCatalog());
});

add('GET', '/api/catalog/products', async ({ res }) => {
  send(res, 200, (await buildCatalog()).products);
});

add('GET', '/api/catalog/products/:productId', async ({ res, params }) => {
  const product = await getProduct(params.productId);
  if (!product) return send(res, 404, { error: 'not_found' });
  send(res, 200, product);
});

add('GET', '/api/catalog/products/:productId/modules/:moduleName', async ({ res, params }) => {
  const m = await getModule(params.productId, params.moduleName);
  if (!m) return send(res, 404, { error: 'not_found' });
  send(res, 200, m);
});

add('GET', '/api/catalog/endpoints/:endpointId', async ({ res, params }) => {
  const e = await getEndpoint(params.endpointId);
  if (!e) return send(res, 404, { error: 'not_found' });
  send(res, 200, e);
});

add('GET', '/api/catalog/endpoints-without-tools', async ({ res }) => {
  send(res, 200, await listEndpointsWithoutTools());
});

// -------------------------------------------------------------------------------------
// Tools
// -------------------------------------------------------------------------------------

add('GET', '/api/tools', async ({ res }) => {
  send(res, 200, await listRegistryTools());
});

add('GET', '/api/tools/by-endpoint/:endpointId', async ({ res, params }) => {
  const t = await findToolByEndpoint(params.endpointId);
  send(res, 200, t ?? null);
});

add('GET', '/api/tools/configurations/:endpointId', async ({ res, params }) => {
  send(res, 200, await getOrCreateConfiguration(params.endpointId));
});

add('GET', '/api/tools/configurations/:endpointId/state', async ({ res, params }) => {
  send(res, 200, await getToolDraftState(params.endpointId));
});

add('PUT', '/api/tools/configurations/:endpointId', async ({ res, params, body }) => {
  const cfg = (await body()) as ToolConfiguration;
  if (cfg.endpointId !== params.endpointId) {
    return send(res, 400, { error: 'endpointId in body does not match URL' });
  }
  send(res, 200, await saveConfiguration(cfg));
});

add('POST', '/api/tools/configurations/:endpointId/publish', async ({ res, params }) => {
  send(res, 200, await publishTool(params.endpointId));
});

add('PUT', '/api/tools/:toolId/status', async ({ res, params, body }) => {
  const { status } = (await body()) as { status: ToolStatus };
  send(res, 200, await setToolStatus(params.toolId, status));
});

// -------------------------------------------------------------------------------------
// Runtime (the only place tools actually execute)
// -------------------------------------------------------------------------------------

add('POST', '/api/runtime/run', async ({ res, body }) => {
  const result = await runTool((await body()) as RunToolRequest);
  send(res, 200, result);
});

// -------------------------------------------------------------------------------------
// Audit / Executions
// -------------------------------------------------------------------------------------

add('GET', '/api/executions', async ({ res }) => {
  send(res, 200, await listExecutions());
});

add('GET', '/api/executions/:id', async ({ res, params }) => {
  const e = await getExecution(params.id);
  if (!e) return send(res, 404, { error: 'not_found' });
  send(res, 200, e);
});

add('GET', '/api/audit', async ({ res }) => {
  send(res, 200, await listAuditEvents());
});

// -------------------------------------------------------------------------------------
// Agents / Knowledge / Gateway / Metrics
//
// Read-only mock surfaces for the MVP; the API Catalog + Tool Runtime is what's "real".
// These exist so the rest of the OneAdmin screens render coherently. Marked clearly.
// -------------------------------------------------------------------------------------

const liveAgents: AgentDefinition[] = JSON.parse(JSON.stringify(seedAgents));

add('GET', '/api/agents', ({ res }) => send(res, 200, liveAgents));

add('GET', '/api/agents/:id', ({ res, params }) => {
  const a = liveAgents.find(x => x.id === params.id);
  if (!a) return send(res, 404, { error: 'not_found' });
  send(res, 200, a);
});

add('PUT', '/api/agents/:id', async ({ res, params, body }) => {
  const next = (await body()) as AgentDefinition;
  const idx = liveAgents.findIndex(x => x.id === params.id);
  if (idx < 0) return send(res, 404, { error: 'not_found' });
  liveAgents[idx] = { ...next, updatedAt: new Date().toISOString() };
  send(res, 200, liveAgents[idx]);
});

add('GET', '/api/knowledge', ({ res }) => send(res, 200, knowledgeSources));

add('GET', '/api/knowledge/:id', ({ res, params }) => {
  const k = knowledgeSources.find(x => x.id === params.id);
  if (!k) return send(res, 404, { error: 'not_found' });
  send(res, 200, k);
});

add('GET', '/api/gateway/assistants', ({ res }) => send(res, 200, gatewayAssistants));
add('GET', '/api/gateway/policies', ({ res }) => send(res, 200, gatewayPolicies));
add('GET', '/api/gateway/rate-limits', ({ res }) => send(res, 200, gatewayRateLimits));
add('GET', '/api/gateway/recent-invocations', ({ res }) => send(res, 200, recentInvocations));

add('GET', '/api/metrics', async ({ res }) => {
  const tools = await listRegistryTools();
  const sources = await listSources();
  const base = computeMetrics();
  send(res, 200, {
    ...base,
    productsImported: sources.filter(s => s.status === 'ok').length || base.productsImported,
    toolsPublished: tools.filter(t => t.status === 'Published').length,
    toolsDraft: tools.filter(t => t.status === 'Draft' || t.status === 'InReview').length,
  });
});

// -------------------------------------------------------------------------------------
// Dispatch
// -------------------------------------------------------------------------------------

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!req.url?.startsWith('/api/')) return false;
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  for (const route of routes) {
    if (route.method !== req.method) continue;
    const m = url.pathname.match(route.pattern);
    if (!m) continue;
    const params: Record<string, string> = {};
    route.paramNames.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
    try {
      await route.handler({
        req,
        res,
        url,
        params,
        body: () => readBody(req),
      });
    } catch (err) {
      console.error('[mvp-bff] handler error:', err);
      if (!res.headersSent) {
        send(res, 500, { error: 'internal_error', message: (err as Error).message });
      }
    }
    return true;
  }

  // /api/* path that didn't match any route → explicit 404 (don't fall through to SPA index).
  send(res, 404, { error: 'route_not_found', method: req.method, path: url.pathname });
  return true;
}
