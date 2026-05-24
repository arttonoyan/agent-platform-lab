import { randomBytes } from 'node:crypto';
import { getEndpoint } from './catalogService';
import { fetchDocForSource, getSource } from './openApiSources';
import { recordExecution } from './auditService';
import type {
  Endpoint,
  ExecutionTrace,
  ExecutionStatus,
  ExecutionToolCall,
  HttpMethod,
  OpenApiSource,
  PlaygroundCallResult,
  RunToolRequest,
} from './types';

/**
 * Tool Runtime — the only place the platform actually executes a tool.
 *
 * For the MVP:
 *  - GET endpoints run for real, server-side. The browser cannot bypass us (it has no
 *    upstream URL, no secrets, no headers).
 *  - POST / PUT / PATCH / DELETE return a `blockedReason` and a full request preview
 *    instead of executing. This makes the Playground useful for write tools (you can
 *    see what *would* go out) without risking real side effects in the MVP.
 *  - Every call — executed or blocked — records one ExecutionTrace via auditService.
 *
 * Seed endpoints (no real `sourceId`) cannot be executed and return a friendly notice.
 * The whole point of the MVP is to drive real OpenAPI sources end to end.
 */

const MVP_ALLOWED_METHODS = new Set<HttpMethod>(['GET']);
const MAX_BODY_SNIPPET = 50_000;

export async function runTool(req: RunToolRequest): Promise<PlaygroundCallResult> {
  if (!req.endpointId) throw new Error('endpointId is required.');
  const endpoint = await getEndpoint(req.endpointId);
  if (!endpoint) throw new Error(`Unknown endpoint ${req.endpointId}.`);

  if (endpoint.isSeed || !endpoint.sourceId) {
    return await blocked(
      endpoint,
      req.parameters,
      'This endpoint is part of the seed catalog (no real OpenAPI source). Register a real OpenAPI source on the OpenAPI Sources page to execute tools.',
      'policy-denied',
    );
  }

  if (!MVP_ALLOWED_METHODS.has(endpoint.method)) {
    return await blocked(
      endpoint,
      req.parameters,
      `${endpoint.method} tools require human approval and are disabled in the MVP. The request preview shows exactly what would be sent.`,
      'policy-denied',
    );
  }

  const source = await getSource(endpoint.sourceId);
  if (!source) {
    return await blocked(
      endpoint,
      req.parameters,
      `Cannot execute: source ${endpoint.sourceId} no longer exists.`,
      'tool-error',
    );
  }

  // Need the doc to resolve the live base URL when no override is set.
  const baseUrl = source.baseUrlOverride?.trim() || (await fetchDocForSource(source.id)).baseUrl;
  const request = buildRequest(endpoint, source, baseUrl, req.parameters);

  const start = Date.now();
  let status = 0;
  let contentType = '';
  let body: unknown = null;
  let executionStatus: ExecutionStatus = 'success';
  let blockedReason: string | undefined;

  try {
    const res = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
    });
    status = res.status;
    contentType = res.headers.get('content-type') ?? '';
    body = await readBody(res, contentType);
    if (!res.ok) executionStatus = 'tool-error';
  } catch (err) {
    blockedReason = `Network or runtime error: ${(err as Error).message}`;
    executionStatus = 'tool-error';
    body = { error: blockedReason };
  }

  const durationMs = Date.now() - start;
  const traceId = randomTraceId();
  const executionId = `exec_${randomBytes(4).toString('hex')}`;
  await recordExecution(buildExecution(executionId, traceId, endpoint, request, body, status, durationMs, executionStatus));

  return {
    statusCode: status,
    durationMs,
    contentType,
    request: { method: request.method, url: request.url, headers: request.headers, body: request.body },
    body,
    blockedReason,
    executionId,
  };
}

interface BuiltRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

function buildRequest(
  endpoint: Endpoint,
  source: OpenApiSource,
  baseUrl: string,
  parameters: Record<string, string>,
): BuiltRequest {
  let path = endpoint.path;
  const query: string[] = [];
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...source.defaultHeaders,
  };
  let body: unknown | undefined;

  for (const p of endpoint.parameters) {
    const value = parameters[p.name];
    if (value === undefined || value === '') continue;
    switch (p.in) {
      case 'path':
        path = path.replace(`{${p.name}}`, encodeURIComponent(value));
        break;
      case 'query':
        query.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(value)}`);
        break;
      case 'header':
        headers[p.name] = value;
        break;
      case 'body':
        try { body = JSON.parse(value); } catch { body = value; }
        break;
    }
  }

  // Source-level auth header (server-side only — never echoed to the client).
  if (source.auth.kind === 'apiKey' && source.auth.headerName && source.auth.secret) {
    headers[source.auth.headerName] = source.auth.secret;
  } else if (source.auth.kind === 'bearer' && source.auth.secret) {
    headers.Authorization = `Bearer ${source.auth.secret}`;
  }

  const url = `${baseUrl}${path}${query.length ? `?${query.join('&')}` : ''}`;
  return { method: endpoint.method, url, headers: maskSecrets(headers, source), body };
}

/**
 * Strip live secret values from the headers we return to the client. The Playground
 * displays the request the runtime would send, but the operator should never see the
 * actual secret rendered in the browser — even though they registered it themselves.
 */
function maskSecrets(headers: Record<string, string>, source: OpenApiSource): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (
      (source.auth.kind === 'apiKey' && source.auth.headerName && k.toLowerCase() === source.auth.headerName.toLowerCase()) ||
      (source.auth.kind === 'bearer' && k.toLowerCase() === 'authorization')
    ) {
      masked[k] = '***';
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

async function readBody(res: Response, contentType: string): Promise<unknown> {
  const text = await res.text();
  if (text.length > MAX_BODY_SNIPPET) {
    return { _truncated: true, _bytes: text.length, snippet: text.slice(0, MAX_BODY_SNIPPET) };
  }
  if (contentType.includes('json')) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return text;
}

async function blocked(
  endpoint: Endpoint,
  parameters: Record<string, string>,
  reason: string,
  status: ExecutionStatus,
): Promise<PlaygroundCallResult> {
  const source = endpoint.sourceId ? await getSource(endpoint.sourceId) : undefined;
  let baseUrl = source?.baseUrlOverride ?? '(unconfigured)';
  if (source && !source.baseUrlOverride) {
    try { baseUrl = (await fetchDocForSource(source.id)).baseUrl; }
    catch { /* keep '(unconfigured)' if doc fetch fails */ }
  }
  const previewSource: OpenApiSource = source
    ?? {
      id: 'preview',
      name: 'preview',
      displayName: 'Preview only',
      url: '',
      defaultHeaders: {},
      auth: { kind: 'none' },
      status: 'unfetched',
      productId: endpoint.productId,
      createdAt: new Date().toISOString(),
    };
  const request = buildRequest(endpoint, previewSource, baseUrl, parameters);
  const traceId = randomTraceId();
  const executionId = `exec_${randomBytes(4).toString('hex')}`;
  await recordExecution(buildExecution(executionId, traceId, endpoint, request, null, 0, 0, status, reason));

  return {
    statusCode: 0,
    durationMs: 0,
    contentType: 'application/json',
    request,
    body: { blocked: true, reason },
    blockedReason: reason,
    executionId,
  };
}

function buildExecution(
  id: string,
  traceId: string,
  endpoint: Endpoint,
  request: BuiltRequest,
  body: unknown,
  status: number,
  durationMs: number,
  executionStatus: ExecutionStatus,
  policyReason?: string,
): ExecutionTrace {
  const toolCall: ExecutionToolCall = {
    toolName: endpoint.operationId,
    productId: endpoint.productId,
    moduleId: endpoint.moduleId,
    arguments: { request: { method: request.method, url: request.url } },
    result: body,
    durationMs,
    statusCode: status,
    policyDecision: policyReason ? 'deny' : 'allow',
    policyReason,
  };
  return {
    id,
    traceId,
    timestamp: new Date().toISOString(),
    assistantId: 'oneadmin_playground',
    agentName: 'PlaygroundRunner',
    productId: endpoint.productId,
    tenantId: 'local',
    userId: 'oneadmin',
    userMessage: `Playground: ${endpoint.method} ${endpoint.path}`,
    agentResponse: status === 0 && policyReason ? policyReason : `HTTP ${status} in ${durationMs} ms`,
    tools: [toolCall],
    latencyMs: durationMs,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    status: executionStatus,
    model: 'n/a (playground)',
    routerReason: 'Direct playground execution',
  };
}

function randomTraceId(): string {
  return randomBytes(16).toString('hex');
}
