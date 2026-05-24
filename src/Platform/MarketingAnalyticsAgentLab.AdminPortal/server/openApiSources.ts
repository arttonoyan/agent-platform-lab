import { randomBytes } from 'node:crypto';
import { readJson, STORE_FILES, writeJson } from './store';
import { fetchOpenApiDocument } from './openApiClient';
import type { OpenApiSource, RegisterOpenApiSourceRequest } from './types';

/**
 * OpenAPI source management.
 *
 * A source is a registered OpenAPI document URL. Sources are the only first-class
 * "where do real endpoints come from?" object in the platform. Everything else
 * (catalog, tools, runtime) is derived.
 */

interface SourcesFile {
  sources: OpenApiSource[];
}

async function load(): Promise<SourcesFile> {
  return readJson<SourcesFile>(STORE_FILES.sources, { sources: [] });
}

async function save(file: SourcesFile): Promise<void> {
  await writeJson(STORE_FILES.sources, file);
}

export async function listSources(): Promise<OpenApiSource[]> {
  return (await load()).sources;
}

export async function getSource(id: string): Promise<OpenApiSource | undefined> {
  return (await load()).sources.find(s => s.id === id);
}

function newId(): string {
  return `src_${randomBytes(4).toString('hex')}`;
}

function sanitizeName(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'source';
}

export async function registerSource(req: RegisterOpenApiSourceRequest): Promise<OpenApiSource> {
  if (!req.url?.trim()) throw new Error('OpenAPI source URL is required.');
  if (!req.name?.trim()) throw new Error('OpenAPI source name is required.');

  const file = await load();
  const id = newId();
  const source: OpenApiSource = {
    id,
    name: sanitizeName(req.name),
    displayName: req.displayName?.trim() || req.name.trim(),
    description: req.description?.trim() || undefined,
    url: req.url.trim(),
    baseUrlOverride: req.baseUrlOverride?.trim() || undefined,
    defaultHeaders: req.defaultHeaders ?? {},
    auth: req.auth
      ? { kind: req.auth.kind, headerName: req.auth.headerName, secret: req.auth.secret }
      : { kind: 'none' },
    status: 'unfetched',
    productId: id,
    environment: req.environment?.trim() || 'dev',
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  file.sources.push(source);
  await save(file);
  return source;
}

/**
 * In-place update of an existing source. Only the writable fields below are accepted;
 * `id`, `productId`, `createdAt`, and the fetch result (`status`, `lastFetchedAt`,
 * `operationCount`, `title`, `version`, `lastError`) are managed by the server.
 *
 * Returns the updated source. Caller is responsible for calling `refreshSource` if any
 * change should trigger an OpenAPI refetch.
 */
export async function updateSource(
  id: string,
  patch: Partial<Pick<OpenApiSource,
    'displayName' | 'description' | 'url' | 'baseUrlOverride'
    | 'defaultHeaders' | 'auth' | 'environment' | 'enabled'>>,
): Promise<OpenApiSource> {
  const file = await load();
  const source = file.sources.find(s => s.id === id);
  if (!source) throw new Error(`OpenAPI source ${id} not found.`);

  if (patch.displayName !== undefined)     source.displayName     = patch.displayName.trim() || source.displayName;
  if (patch.description !== undefined)     source.description     = patch.description.trim() || undefined;
  if (patch.url !== undefined)             source.url             = patch.url.trim() || source.url;
  if (patch.baseUrlOverride !== undefined) source.baseUrlOverride = patch.baseUrlOverride.trim() || undefined;
  if (patch.defaultHeaders !== undefined)  source.defaultHeaders  = patch.defaultHeaders;
  if (patch.auth !== undefined)            source.auth            = patch.auth;
  if (patch.environment !== undefined)     source.environment     = patch.environment.trim() || source.environment;
  if (patch.enabled !== undefined)         source.enabled         = patch.enabled;

  await save(file);
  return source;
}

export async function refreshSource(id: string): Promise<OpenApiSource> {
  const file = await load();
  const source = file.sources.find(s => s.id === id);
  if (!source) throw new Error(`OpenAPI source ${id} not found.`);

  try {
    const doc = await fetchOpenApiDocument(source.url);
    source.status = 'ok';
    source.lastFetchedAt = new Date().toISOString();
    source.lastError = undefined;
    source.operationCount = doc.operationCount;
    source.title = doc.title;
    source.version = doc.version;
    if (!source.description) source.description = doc.description;
    if (!source.baseUrlOverride && doc.baseUrl) {
      // Surface the resolved base URL in the UI even if no override is set.
      // We do NOT store it as override — that would lock it in. We just expose it.
    }
  } catch (err) {
    source.status = 'error';
    source.lastError = (err as Error).message;
    source.lastFetchedAt = new Date().toISOString();
  }

  await save(file);
  return source;
}

export async function deleteSource(id: string): Promise<boolean> {
  const file = await load();
  const before = file.sources.length;
  file.sources = file.sources.filter(s => s.id !== id);
  if (file.sources.length === before) return false;
  await save(file);
  return true;
}

/**
 * The full, parsed document for a source — only kept in-memory; we refetch on demand.
 * For MVP this is good enough; a real backend would cache parsed docs in Redis or disk.
 */
export async function fetchDocForSource(id: string): Promise<Awaited<ReturnType<typeof fetchOpenApiDocument>>> {
  const source = await getSource(id);
  if (!source) throw new Error(`OpenAPI source ${id} not found.`);
  return fetchOpenApiDocument(source.url);
}
