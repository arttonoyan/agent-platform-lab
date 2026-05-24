import type {
  AgentDefinition,
  AuditEvent,
  Endpoint,
  ExecutionTrace,
  GatewayAssistant,
  GatewayInvocationSummary,
  GatewayPolicy,
  GatewayRateLimit,
  KnowledgeSource,
  Module,
  OpenApiAuthKind,
  OpenApiSource,
  PlatformMetrics,
  Product,
  RegistryTool,
  ToolConfiguration,
  ToolDraftState,
  ToolStatus,
} from '../data/types';

/**
 * Client-side API. All requests go to `/api/*` on this same origin, which is served
 * by the MVP BFF (see `server/`). The BFF is the only place that:
 *   - fetches real OpenAPI documents (no CORS from the browser),
 *   - executes real tools against upstream endpoints,
 *   - holds source-level secrets (API keys / bearers) — they are never sent to the UI.
 *
 * Every export preserves the shape components were already consuming so the UI layer
 * stays untouched.
 */

// -------------------------------------------------------------------------------------
// Fetch helpers
// -------------------------------------------------------------------------------------

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: 'application/json' } });
  return handle<T>(res, path);
}

async function send<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle<T>(res, path);
}

async function handle<T>(res: Response, path: string): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? safeParse(text) : undefined;
  if (!res.ok) {
    const message = isObject(body) && typeof body.message === 'string'
      ? body.message
      : `${res.status} ${res.statusText} ${path}`;
    throw new Error(message);
  }
  return body as T;
}

function safeParse(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

// -------------------------------------------------------------------------------------
// OpenAPI Sources
// -------------------------------------------------------------------------------------

export interface RegisterOpenApiSourceRequest {
  name: string;
  displayName?: string;
  description?: string;
  url: string;
  baseUrlOverride?: string;
  defaultHeaders?: Record<string, string>;
  environment?: string;
  auth?: {
    kind: OpenApiAuthKind;
    headerName?: string;
    secret?: string;
  };
}

export interface UpdateOpenApiSourceRequest {
  displayName?: string;
  description?: string;
  url?: string;
  baseUrlOverride?: string;
  defaultHeaders?: Record<string, string>;
  environment?: string;
  enabled?: boolean;
  auth?: {
    kind: OpenApiAuthKind;
    headerName?: string;
    secret?: string;
  };
}

export const openApiSourcesApi = {
  list: (): Promise<OpenApiSource[]> => get('/api/openapi/sources'),
  get: (id: string): Promise<OpenApiSource> => get(`/api/openapi/sources/${id}`),
  register: (req: RegisterOpenApiSourceRequest): Promise<OpenApiSource> =>
    send('POST', '/api/openapi/sources', req),
  update: (id: string, patch: UpdateOpenApiSourceRequest): Promise<OpenApiSource> =>
    send('PUT', `/api/openapi/sources/${id}`, patch),
  remove: (id: string): Promise<void> => send('DELETE', `/api/openapi/sources/${id}`),
  refresh: (id: string): Promise<OpenApiSource> =>
    send('POST', `/api/openapi/sources/${id}/refresh`),
  document: (id: string): Promise<{ raw: unknown; title: string; description?: string; version: string; baseUrl: string; operationCount: number }> =>
    get(`/api/openapi/sources/${id}/document`),
};

// -------------------------------------------------------------------------------------
// Catalog
// -------------------------------------------------------------------------------------

export interface CatalogResult {
  products: Product[];
  realSourceCount: number;
  seededFallback: boolean;
}

export const catalogApi = {
  getCatalog: (): Promise<CatalogResult> => get('/api/catalog'),
  listProducts: async (): Promise<Product[]> => (await catalogApi.getCatalog()).products,
  getProduct: (productId: string): Promise<Product | undefined> =>
    or404(get<Product>(`/api/catalog/products/${productId}`)),
  getModule: (productId: string, moduleName: string): Promise<Module | undefined> =>
    or404(get<Module>(`/api/catalog/products/${productId}/modules/${moduleName}`)),
  getEndpoint: (endpointId: string): Promise<Endpoint | undefined> =>
    or404(get<Endpoint>(`/api/catalog/endpoints/${encodeURIComponent(endpointId)}`)),
  listEndpoints: async (): Promise<Endpoint[]> => {
    const products = await catalogApi.listProducts();
    return products.flatMap(p => p.modules.flatMap(m => m.endpoints));
  },
  endpointsWithoutTools: (): Promise<Endpoint[]> => get('/api/catalog/endpoints-without-tools'),
};

/** Convert a `404 not_found` rejection into `undefined`; rethrow anything else. */
function or404<T>(p: Promise<T>): Promise<T | undefined> {
  return p.catch((err: unknown) => {
    if (err instanceof Error && /\b404\b/.test(err.message)) return undefined;
    throw err;
  });
}

// -------------------------------------------------------------------------------------
// Tools
// -------------------------------------------------------------------------------------

export const toolsApi = {
  listRegistryTools: (): Promise<RegistryTool[]> => get('/api/tools'),
  getRegistryToolByEndpoint: (endpointId: string): Promise<RegistryTool | undefined> =>
    get<RegistryTool | null>(`/api/tools/by-endpoint/${encodeURIComponent(endpointId)}`)
      .then(v => v ?? undefined),
  getOrCreateConfiguration: (endpointId: string): Promise<ToolConfiguration> =>
    get(`/api/tools/configurations/${encodeURIComponent(endpointId)}`),
  getDraftState: (endpointId: string): Promise<ToolDraftState> =>
    get(`/api/tools/configurations/${encodeURIComponent(endpointId)}/state`),
  saveConfiguration: (cfg: ToolConfiguration): Promise<ToolConfiguration> =>
    send('PUT', `/api/tools/configurations/${encodeURIComponent(cfg.endpointId)}`, cfg),
  publishConfiguration: (endpointId: string): Promise<RegistryTool> =>
    send('POST', `/api/tools/configurations/${encodeURIComponent(endpointId)}/publish`),
  setStatus: (toolId: string, status: ToolStatus): Promise<RegistryTool> =>
    send('PUT', `/api/tools/${toolId}/status`, { status }),
};

// -------------------------------------------------------------------------------------
// Playground / Runtime
// -------------------------------------------------------------------------------------

export interface PlaygroundCallResult {
  statusCode: number;
  durationMs: number;
  contentType: string;
  request: { method: string; url: string; headers: Record<string, string>; body?: unknown };
  body: unknown;
  blockedReason?: string;
  executionId?: string;
}

export const playgroundApi = {
  /**
   * Real execution: POST { endpointId, parameters } to the BFF. The BFF resolves the
   * OpenAPI source, injects auth, executes the request server-side (GET only in MVP),
   * records an audit entry, and returns the result + execution id.
   */
  call: (endpointId: string, parameters: Record<string, string>): Promise<PlaygroundCallResult> =>
    send('POST', '/api/runtime/run', { endpointId, parameters }),

  /**
   * Mock LLM playground (no real model wired in MVP). Useful to validate that the tool
   * description leads the LLM to pick this tool. Will be replaced with a real backend
   * LLM call later — the signature is stable.
   */
  askAi: async (
    endpoint: Endpoint,
    toolConfig: ToolConfiguration,
    prompt: string,
  ): Promise<{
    reply: string;
    toolCalled: boolean;
    toolName: string;
    arguments: Record<string, string>;
    durationMs: number;
  }> => {
    const start = Date.now();
    await new Promise(r => setTimeout(r, 500 + Math.random() * 400));
    const lower = prompt.toLowerCase();
    const tokens = (endpoint.summary + ' ' + endpoint.description + ' ' + endpoint.tags.join(' '))
      .toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 3);
    const matches = tokens.some(t => lower.includes(t)) ||
      endpoint.parameters.some(p => lower.includes(p.name.toLowerCase()));
    if (!matches) {
      return {
        reply:
          `(mock LLM) I wouldn't have called \`${toolConfig.toolName}\` for that prompt — the tool description doesn't mention concepts that appear in the question. Tighten the description on the Tool Configuration tab.`,
        toolCalled: false,
        toolName: toolConfig.toolName,
        arguments: {},
        durationMs: Date.now() - start,
      };
    }
    const args = Object.fromEntries(
      endpoint.parameters
        .filter(p => p.required || lower.includes(p.name.toLowerCase()))
        .map(p => [p.name, toolConfig.parameterDefaults[p.name] ?? (p.example != null ? String(p.example) : '')]),
    );
    return {
      reply: `(mock LLM) I'd call \`${toolConfig.toolName}\` with the arguments shown and summarise the result for the user.`,
      toolCalled: true,
      toolName: toolConfig.toolName,
      arguments: args,
      durationMs: Date.now() - start,
    };
  },
};

// -------------------------------------------------------------------------------------
// Agents
// -------------------------------------------------------------------------------------

export const agentsApi = {
  list: (): Promise<AgentDefinition[]> => get('/api/agents'),
  get: (id: string): Promise<AgentDefinition | undefined> =>
    or404(get<AgentDefinition>(`/api/agents/${id}`)),
  save: (agent: AgentDefinition): Promise<AgentDefinition> =>
    send('PUT', `/api/agents/${agent.id}`, agent),
};

// -------------------------------------------------------------------------------------
// Knowledge sources
// -------------------------------------------------------------------------------------

export const knowledgeApi = {
  list: (): Promise<KnowledgeSource[]> => get('/api/knowledge'),
  get: (id: string): Promise<KnowledgeSource | undefined> =>
    or404(get<KnowledgeSource>(`/api/knowledge/${id}`)),
};

// -------------------------------------------------------------------------------------
// AI Gateway
// -------------------------------------------------------------------------------------

export const gatewayApi = {
  listAssistants: (): Promise<GatewayAssistant[]> => get('/api/gateway/assistants'),
  listPolicies: (): Promise<GatewayPolicy[]> => get('/api/gateway/policies'),
  listRateLimits: (): Promise<GatewayRateLimit[]> => get('/api/gateway/rate-limits'),
  listRecentInvocations: (): Promise<GatewayInvocationSummary[]> =>
    get('/api/gateway/recent-invocations'),
};

// -------------------------------------------------------------------------------------
// Executions / Audit
// -------------------------------------------------------------------------------------

export const observabilityApi = {
  listExecutions: (): Promise<ExecutionTrace[]> => get('/api/executions'),
  getExecution: (id: string): Promise<ExecutionTrace | undefined> =>
    or404(get<ExecutionTrace>(`/api/executions/${id}`)),
  listAuditEvents: (): Promise<AuditEvent[]> => get('/api/audit'),
};

// -------------------------------------------------------------------------------------
// Dashboard metrics
// -------------------------------------------------------------------------------------

export const metricsApi = {
  get: (): Promise<PlatformMetrics> => get('/api/metrics'),
};
