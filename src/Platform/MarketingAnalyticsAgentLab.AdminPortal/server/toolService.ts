import { randomBytes } from 'node:crypto';
import { buildCatalog, getEndpoint } from './catalogService';
import { readJson, STORE_FILES, writeJson } from './store';
import { registryTools as seedTools, makeDraftConfiguration } from '../src/data/tools';
import type { Endpoint, RegistryTool, ToolConfiguration, ToolDraftState, ToolStatus } from './types';

/**
 * Tool service.
 *
 * Responsibilities:
 *  - Tool draft generation: given any Endpoint (real or seed), produce a sensible
 *    default ToolConfiguration (snake_case name, description from summary, default
 *    params from examples, sane policy based on writeSafety / x-st-pii).
 *  - Tool configuration persistence: store edits per-endpoint.
 *  - Tool registry: list every published / drafted tool.
 *
 * Configurations and published tools are persisted under `.mvp-state/`. Seed tools
 * are merged in for endpoints that have never been touched by a real user yet, so the
 * UI always has something to show.
 */

interface ConfigurationsFile {
  configurations: ToolConfiguration[];
}

interface PublishedToolsFile {
  tools: RegistryTool[];
}

async function loadConfigs(): Promise<ConfigurationsFile> {
  return readJson<ConfigurationsFile>(STORE_FILES.configurations, { configurations: [] });
}

async function saveConfigs(file: ConfigurationsFile): Promise<void> {
  await writeJson(STORE_FILES.configurations, file);
}

async function loadPublished(): Promise<PublishedToolsFile> {
  return readJson<PublishedToolsFile>(STORE_FILES.publishedTools, { tools: [] });
}

async function savePublished(file: PublishedToolsFile): Promise<void> {
  await writeJson(STORE_FILES.publishedTools, file);
}

/** Convenience: get a configuration if one exists, else build a draft from the endpoint. */
export async function getOrCreateConfiguration(endpointId: string): Promise<ToolConfiguration> {
  const file = await loadConfigs();
  const existing = file.configurations.find(c => c.endpointId === endpointId);
  if (existing) return existing;
  const endpoint = await getEndpoint(endpointId);
  if (!endpoint) throw new Error(`Unknown endpoint ${endpointId}`);
  return makeDraftConfiguration(endpoint);
}

/**
 * Lifecycle snapshot for an endpoint: does the user have a saved tool configuration?
 * Is there already a row in the published-tools registry for this endpoint?
 *
 * Powers the API Catalog endpoint tabs (Tool Configuration / Playground / Publish) so
 * we can show the right "save draft / publish / disabled" affordances and the right
 * "create a tool configuration first" placeholders.
 */
export async function getToolDraftState(endpointId: string): Promise<ToolDraftState> {
  const [file, registryTool] = await Promise.all([loadConfigs(), findToolByEndpoint(endpointId)]);
  const persisted = file.configurations.find(c => c.endpointId === endpointId);
  return {
    endpointId,
    hasConfiguration: !!persisted || !!registryTool,
    hasRegistryTool: !!registryTool,
    registryToolId: registryTool?.id,
    toolName: registryTool?.toolName ?? persisted?.toolName,
    status: registryTool?.status,
    version: registryTool?.version,
    publishedAt: registryTool?.publishedAt,
  };
}

export async function saveConfiguration(cfg: ToolConfiguration): Promise<ToolConfiguration> {
  const file = await loadConfigs();
  const idx = file.configurations.findIndex(c => c.endpointId === cfg.endpointId);
  if (idx >= 0) file.configurations[idx] = cfg;
  else file.configurations.push(cfg);
  await saveConfigs(file);

  // Mirror into the published-tools row when it exists so the registry view stays in sync.
  const pub = await loadPublished();
  const pubIdx = pub.tools.findIndex(t => t.endpointId === cfg.endpointId);
  if (pubIdx >= 0) {
    pub.tools[pubIdx] = {
      ...pub.tools[pubIdx],
      toolName: cfg.toolName,
      configuration: cfg,
    };
    await savePublished(pub);
  }

  return cfg;
}

export async function publishTool(endpointId: string): Promise<RegistryTool> {
  const cfg = await getOrCreateConfiguration(endpointId);
  const endpoint = await getEndpoint(endpointId);
  if (!endpoint) throw new Error(`Unknown endpoint ${endpointId}`);

  const pub = await loadPublished();
  const existing = pub.tools.find(t => t.endpointId === endpointId);
  if (existing) {
    existing.toolName = cfg.toolName;
    existing.status = 'Published';
    existing.publishedAt = new Date().toISOString();
    existing.configuration = { ...cfg, enabled: true };
  } else {
    const next: RegistryTool = {
      id: `tool_${randomBytes(3).toString('hex')}`,
      toolName: cfg.toolName,
      productId: endpoint.productId,
      moduleId: endpoint.moduleId,
      endpointId: endpoint.id,
      version: '1.0.0',
      status: 'Published',
      owner: 'You',
      publishedAt: new Date().toISOString(),
      configuration: { ...cfg, enabled: true },
    };
    pub.tools.push(next);
  }
  await savePublished(pub);

  // Mirror back into the configuration store so the next read sees enabled=true.
  await saveConfiguration({ ...cfg, enabled: true });

  return pub.tools.find(t => t.endpointId === endpointId)!;
}

export async function setToolStatus(toolId: string, status: ToolStatus): Promise<RegistryTool> {
  const pub = await loadPublished();
  const tool = pub.tools.find(t => t.id === toolId);
  if (!tool) throw new Error(`Tool ${toolId} not found.`);
  tool.status = status;
  if (status === 'Published') tool.publishedAt = new Date().toISOString();
  await savePublished(pub);
  return tool;
}

/**
 * Registry = seed tools + every user-published tool.
 *
 * Where both exist for the same endpoint, the user-published row wins. Seed entries are
 * tagged `isSeed=true` so the UI can render a clear "Sample" badge — operators never
 * have to wonder whether a row is real or demo data.
 */
export async function listRegistryTools(): Promise<RegistryTool[]> {
  const pub = await loadPublished();
  const userByEndpoint = new Map<string, RegistryTool>();
  for (const t of pub.tools) userByEndpoint.set(t.endpointId, t);

  const merged: RegistryTool[] = [];
  for (const t of pub.tools) merged.push({ ...t, isSeed: false });
  for (const seed of seedTools) {
    if (!userByEndpoint.has(seed.endpointId)) merged.push({ ...seed, isSeed: true });
  }
  return merged.sort((a, b) => a.toolName.localeCompare(b.toolName));
}

export async function findToolByEndpoint(endpointId: string): Promise<RegistryTool | undefined> {
  return (await listRegistryTools()).find(t => t.endpointId === endpointId);
}

export async function listEndpointsWithoutTools(): Promise<Endpoint[]> {
  const tools = await listRegistryTools();
  const covered = new Set(tools.map(t => t.endpointId));
  const { products } = await buildCatalog();
  const all: Endpoint[] = [];
  for (const p of products) for (const m of p.modules) for (const e of m.endpoints) all.push(e);
  return all.filter(e => !covered.has(e.id));
}
