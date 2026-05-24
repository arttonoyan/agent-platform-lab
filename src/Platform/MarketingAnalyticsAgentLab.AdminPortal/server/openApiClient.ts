import type { Endpoint, HttpMethod, Module, ParameterDefinition, Product } from './types';

/**
 * OpenAPI 3 fetch + parse, server-side.
 *
 * The browser cannot reach internal OpenAPI URLs in general (CORS, private IPs). The
 * BFF fetches and parses on Node, then exposes the catalog model the UI already speaks.
 *
 * Supports OpenAPI 3 JSON documents. YAML is intentionally out of scope for the MVP —
 * we surface a clear error so the operator knows to convert or point at a JSON URL.
 */

const SUPPORTED_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export interface FetchedOpenApiDocument {
  raw: unknown;
  title: string;
  description?: string;
  version: string;
  baseUrl: string;
  operationCount: number;
}

export interface OpenApiCatalogResult {
  doc: FetchedOpenApiDocument;
  modules: Module[];
}

interface OpenApiDoc {
  openapi?: string;
  swagger?: string;
  info: { title?: string; description?: string; version?: string };
  servers?: { url: string; description?: string }[];
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, unknown>; parameters?: Record<string, unknown>; securitySchemes?: Record<string, unknown> };
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: {
    description?: string;
    required?: boolean;
    content?: Record<string, { schema?: OpenApiSchema; example?: unknown; examples?: Record<string, { value?: unknown }> }>;
  };
  responses?: Record<string, {
    description?: string;
    content?: Record<string, { schema?: OpenApiSchema; example?: unknown; examples?: Record<string, { value?: unknown }> }>;
  }>;
  deprecated?: boolean;
  'x-st-pii'?: boolean;
  'x-st-stability'?: string;
  'x-st-rate-limit'?: 'low' | 'medium' | 'high';
}

interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  example?: unknown;
  schema?: OpenApiSchema;
}

interface OpenApiSchema {
  type?: string;
  format?: string;
  example?: unknown;
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  enum?: unknown[];
  $ref?: string;
}

export async function fetchOpenApiDocument(url: string): Promise<FetchedOpenApiDocument> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json, application/yaml;q=0.5, */*;q=0.1' },
  });
  if (!res.ok) {
    throw new Error(`Upstream returned ${res.status} ${res.statusText} when fetching ${url}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();
  const looksLikeYaml =
    contentType.includes('yaml') ||
    url.endsWith('.yaml') ||
    url.endsWith('.yml') ||
    (!contentType.includes('json') && !text.trimStart().startsWith('{'));
  if (looksLikeYaml) {
    throw new Error(
      'This OpenAPI document looks like YAML. The MVP supports JSON OpenAPI 3 documents only — please point at a JSON URL or convert with a tool like `npx js-yaml`.',
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`Could not parse the document as JSON: ${(err as Error).message}`);
  }

  const doc = raw as OpenApiDoc;
  if (doc.swagger && !doc.openapi) {
    throw new Error(
      `This is a Swagger 2.0 document (swagger=${doc.swagger}). The MVP supports OpenAPI 3 only.`,
    );
  }
  if (!doc.openapi?.startsWith('3.')) {
    throw new Error(`Unsupported OpenAPI version: ${doc.openapi ?? '(missing)'}. Expected 3.x.`);
  }

  const baseUrl = resolveBaseUrl(doc, url);
  const operationCount = countOperations(doc);
  return {
    raw,
    title: doc.info?.title ?? '(untitled OpenAPI document)',
    description: doc.info?.description,
    version: doc.info?.version ?? '0.0.0',
    baseUrl,
    operationCount,
  };
}

function countOperations(doc: OpenApiDoc): number {
  let n = 0;
  for (const ops of Object.values(doc.paths ?? {})) {
    for (const m of Object.keys(ops)) {
      if (SUPPORTED_METHODS.includes(m.toUpperCase() as HttpMethod)) n++;
    }
  }
  return n;
}

function resolveBaseUrl(doc: OpenApiDoc, docUrl: string): string {
  const first = doc.servers?.[0]?.url;
  if (!first) return new URL('.', docUrl).toString().replace(/\/$/, '');
  try {
    // Absolute URL? Use as-is.
    return new URL(first).toString().replace(/\/$/, '');
  } catch {
    // Relative URL — resolve against the doc URL.
    return new URL(first, docUrl).toString().replace(/\/$/, '');
  }
}

export function buildCatalogFromOpenApi(
  doc: FetchedOpenApiDocument,
  productId: string,
  productDisplayName: string,
  lastUpdated: string,
): OpenApiCatalogResult {
  const raw = doc.raw as OpenApiDoc;
  const moduleMap = new Map<string, { displayName: string; description: string; endpoints: Endpoint[] }>();

  for (const [path, ops] of Object.entries(raw.paths ?? {})) {
    for (const [methodKey, op] of Object.entries(ops)) {
      const method = methodKey.toUpperCase() as HttpMethod;
      if (!SUPPORTED_METHODS.includes(method)) continue;

      const tag = (op.tags?.[0] ?? deriveTagFromPath(path)).trim() || 'default';
      const moduleName = sanitize(tag);
      const moduleId = `${productId}.${moduleName}`;

      if (!moduleMap.has(moduleName)) {
        moduleMap.set(moduleName, {
          displayName: tag,
          description: `Operations tagged "${tag}".`,
          endpoints: [],
        });
      }

      const operationId = op.operationId?.trim() || synthesizeOperationId(method, path);
      const stability = (op['x-st-stability'] as 'stable' | 'beta' | 'deprecated' | 'internal') ?? (op.deprecated ? 'deprecated' : 'stable');
      const writeSafety = method === 'GET'
        ? 'read'
        : method === 'DELETE'
        ? 'destructive'
        : 'write';

      const endpoint: Endpoint = {
        id: `${productId}.${moduleName}.${operationId}`,
        productId,
        moduleId,
        operationId,
        method,
        path,
        summary: op.summary ?? '',
        description: op.description ?? op.summary ?? '',
        parameters: collectParameters(op),
        responseExample: pickResponseExample(op),
        responseStatus: pickResponseStatus(op),
        tags: op.tags ?? [tag],
        stability,
        writeSafety,
        xStMetadata: {
          product: productId,
          module: moduleName,
          stability,
          pii: op['x-st-pii'],
          rateLimitTier: op['x-st-rate-limit'] ?? 'medium',
        },
        lastUpdated,
      };
      moduleMap.get(moduleName)!.endpoints.push(endpoint);
    }
  }

  const modules: Module[] = Array.from(moduleMap.entries()).map(([name, m]) => ({
    id: `${productId}.${name}`,
    productId,
    name,
    displayName: m.displayName,
    description: m.description,
    endpoints: m.endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
  })).sort((a, b) => a.displayName.localeCompare(b.displayName));

  // Keep the productDisplayName parameter referenced — the surrounding catalog service uses it.
  void productDisplayName;
  return { doc, modules };
}

function collectParameters(op: OpenApiOperation): ParameterDefinition[] {
  const out: ParameterDefinition[] = [];

  for (const p of op.parameters ?? []) {
    if (p.in === 'cookie') continue; // not modelled in MVP
    out.push({
      name: p.name,
      in: p.in,
      type: schemaTypeName(p.schema),
      required: !!p.required,
      description: p.description ?? '',
      example: pickExample(p),
    });
  }

  if (op.requestBody?.content) {
    const json = op.requestBody.content['application/json']
      ?? op.requestBody.content['application/*+json']
      ?? Object.values(op.requestBody.content)[0];
    if (json) {
      const example = json.example
        ?? (json.examples && Object.values(json.examples)[0]?.value)
        ?? exampleFromSchema(json.schema);
      out.push({
        name: 'body',
        in: 'body',
        type: schemaTypeName(json.schema),
        required: op.requestBody.required ?? true,
        description: op.requestBody.description ?? 'JSON request body.',
        example: typeof example === 'string' ? example : example ? JSON.stringify(example) : null,
      });
    }
  }

  return out;
}

function pickExample(p: OpenApiParameter): ParameterDefinition['example'] {
  if (p.example !== undefined) return p.example as ParameterDefinition['example'];
  if (p.schema?.example !== undefined) return p.schema.example as ParameterDefinition['example'];
  if (p.schema?.enum?.[0] !== undefined) return p.schema.enum[0] as ParameterDefinition['example'];
  if (p.schema?.type === 'integer' || p.schema?.type === 'number') return 0;
  if (p.schema?.type === 'boolean') return false;
  return undefined;
}

function pickResponseStatus(op: OpenApiOperation): number {
  if (!op.responses) return 200;
  const keys = Object.keys(op.responses);
  for (const k of keys) {
    if (k.startsWith('2')) return Number(k.replace(/x/i, '0')) || 200;
  }
  return 200;
}

function pickResponseExample(op: OpenApiOperation): unknown {
  if (!op.responses) return {};
  const success =
    Object.entries(op.responses).find(([k]) => k.startsWith('2'))?.[1]
    ?? Object.values(op.responses)[0];
  if (!success?.content) return {};
  const json = success.content['application/json'] ?? Object.values(success.content)[0];
  if (!json) return {};
  if (json.example !== undefined) return json.example;
  const fromExamples = json.examples && Object.values(json.examples)[0]?.value;
  if (fromExamples !== undefined) return fromExamples;
  return exampleFromSchema(json.schema) ?? {};
}

function schemaTypeName(schema: OpenApiSchema | undefined): string {
  if (!schema) return 'string';
  if (schema.$ref) return schema.$ref.split('/').pop() ?? 'object';
  if (schema.type === 'array') return `${schemaTypeName(schema.items)}[]`;
  if (schema.format) return `${schema.type ?? 'string'} (${schema.format})`;
  return schema.type ?? 'object';
}

/**
 * Produce a small example from the schema for documentation purposes only.
 * Intentionally shallow — we don't try to be a full $ref resolver in the MVP.
 */
function exampleFromSchema(schema: OpenApiSchema | undefined): unknown {
  if (!schema) return undefined;
  if (schema.example !== undefined) return schema.example;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === 'array') return [exampleFromSchema(schema.items) ?? null];
  if (schema.type === 'object' && schema.properties) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      out[k] = exampleFromSchema(v) ?? null;
    }
    return out;
  }
  switch (schema.type) {
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'string':
      return schema.format === 'date-time' ? '2026-05-23T22:47:11Z' : 'string';
    default:
      return undefined;
  }
}

function sanitize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

function deriveTagFromPath(path: string): string {
  const first = path.split('/').filter(Boolean)[0];
  return first ? first.replace(/[{}]/g, '') : 'default';
}

function synthesizeOperationId(method: HttpMethod, path: string): string {
  const segments = path
    .replace(/[{}]/g, '')
    .split('/')
    .filter(Boolean);
  const verb = method.toLowerCase();
  return `${verb}_${segments.join('_')}` || verb;
}

export function buildProductFromSource(
  sourceId: string,
  productDisplayName: string,
  productDescription: string | undefined,
  doc: FetchedOpenApiDocument,
  lastUpdated: string,
): Product {
  const { modules } = buildCatalogFromOpenApi(doc, sourceId, productDisplayName, lastUpdated);
  // Stamp every endpoint with its sourceId so the runtime can resolve auth & base URL.
  for (const m of modules) {
    for (const e of m.endpoints) {
      e.sourceId = sourceId;
    }
  }
  return {
    id: sourceId,
    name: sourceId,
    displayName: productDisplayName,
    description: productDescription ?? doc.description ?? doc.title,
    domain: 'platform',
    ownerTeam: 'OpenAPI source',
    gatewayBaseUrl: doc.baseUrl,
    stability: 'stable',
    iconKey: 'boxes',
    modules,
  };
}
