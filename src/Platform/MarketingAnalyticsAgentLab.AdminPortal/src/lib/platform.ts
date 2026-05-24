/**
 * Aspire injects env vars of the form `services__<name>__https__0` (and __http__0).
 * Vite re-exposes them to the browser via `envPrefix: ['VITE_', 'services__']`.
 */
export function serviceUrl(name: string): string {
  const envs = import.meta.env as unknown as Record<string, string | undefined>;
  for (const key of [`services__${name}__https__0`, `services__${name}__http__0`]) {
    const val = envs[key];
    if (val) return val.replace(/\/$/, '');
  }
  return '';
}

export const platformUrls = {
  pluginRegistry: () => serviceUrl('plugin-registry'),
  mcpServer: () => serviceUrl('mcp-server'),
  agentRuntime: () => serviceUrl('agent-runtime'),
  aiGateway: () => serviceUrl('ai-gateway'),
  analyticsApi: () => serviceUrl('analytics-api'),
  campaignsApi: () => serviceUrl('campaigns-api'),
  customersApi: () => serviceUrl('customers-api'),
  notificationApi: () => serviceUrl('notification-api'),
  /**
   * Microsoft Agent Framework DevUI runs in-process inside the AgentRuntime at /devui.
   * Used for runtime debugging, trace inspection, and workflow visualization.
   */
  devUi: () => `${serviceUrl('agent-runtime')}/devui`,
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText} - ${url}\n${text}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

export const api = {
  // ---- API specs ----
  listApiSpecs: () => fetchJson<ApiSpecSummary[]>(`${platformUrls.pluginRegistry()}/apis`),
  getApiOperations: (id: string) => fetchJson<ApiOperation[]>(`${platformUrls.pluginRegistry()}/apis/${id}/operations`),
  importApiSpec: (body: ImportApiSpecRequest) =>
    fetchJson<ApiSpecDefinition>(`${platformUrls.pluginRegistry()}/apis/import`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteApiSpec: (id: string) =>
    fetchJson<void>(`${platformUrls.pluginRegistry()}/apis/${id}`, { method: 'DELETE' }),

  // ---- Plugins ----
  listPlugins: (status?: PluginStatus) => {
    const q = status ? `?status=${status}` : '';
    return fetchJson<PluginDefinition[]>(`${platformUrls.pluginRegistry()}/plugins${q}`);
  },
  getPlugin: (id: string) => fetchJson<PluginDefinition>(`${platformUrls.pluginRegistry()}/plugins/${id}`),
  createPlugin: (body: CreatePluginRequest) =>
    fetchJson<PluginDefinition>(`${platformUrls.pluginRegistry()}/plugins`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePlugin: (id: string, body: UpdatePluginRequest) =>
    fetchJson<PluginDefinition>(`${platformUrls.pluginRegistry()}/plugins/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  publishPlugin: (id: string) =>
    fetchJson<PluginDefinition>(`${platformUrls.pluginRegistry()}/plugins/${id}/publish`, { method: 'POST' }),
  unpublishPlugin: (id: string) =>
    fetchJson<PluginDefinition>(`${platformUrls.pluginRegistry()}/plugins/${id}/unpublish`, { method: 'POST' }),
  deletePlugin: (id: string) =>
    fetchJson<void>(`${platformUrls.pluginRegistry()}/plugins/${id}`, { method: 'DELETE' }),
  runPlayground: (id: string, body: PlaygroundRequest) =>
    fetchJson<PlaygroundResponse>(`${platformUrls.pluginRegistry()}/plugins/${id}/playground`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /**
   * AI playground: one-shot LLM run against the plugin's tools. Returns the LLM reply +
   * every tool call (with arguments and result) the LLM made. Useful for validating tool
   * names + descriptions BEFORE publishing the plugin to MCP.
   */
  runAiPlayground: (id: string, body: AiPlaygroundRequest) =>
    fetchJson<AiPlaygroundResponse>(`${platformUrls.agentRuntime()}/plugins/${id}/ai-playground`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ---- Agents ----
  listAgents: () => fetchJson<AgentDefinition[]>(`${platformUrls.pluginRegistry()}/agents`),
  saveAgent: (body: UpsertAgentRequest) =>
    fetchJson<AgentDefinition>(`${platformUrls.pluginRegistry()}/agents`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  reloadAgents: () =>
    fetchJson<{ reloaded: boolean }>(`${platformUrls.agentRuntime()}/agents/reload`, { method: 'POST' }),
  listLiveAgents: () => fetchJson<LiveAgent[]>(`${platformUrls.agentRuntime()}/agents`),
  listLiveTools: () => fetchJson<LiveTool[]>(`${platformUrls.mcpServer()}/tools`),
  /**
   * Recent tool executions captured by the McpServer's in-memory ExecutionLog. Used by the
   * Activity / Executions page to show "what just ran" without a full tracing pipeline.
   */
  listToolExecutions: (limit = 50) =>
    fetchJson<ToolExecutionRecord[]>(`${platformUrls.mcpServer()}/executions?limit=${limit}`),

  // ---- Assistants ----
  listAssistants: () => fetchJson<AssistantDefinition[]>(`${platformUrls.pluginRegistry()}/assistants`),
  saveAssistant: (body: AssistantDefinition) =>
    fetchJson<AssistantDefinition>(`${platformUrls.pluginRegistry()}/assistants`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // ---- AI Runtime Telemetry ----
  // Real execution events persisted by the AI Gateway after every interaction.
  // Shape mirrors data/runtimeEvents.ts:ExecutionEvent so the dashboard can render
  // straight from this feed; the mock in runtimeEvents.ts is now used only as a
  // fallback when the gateway endpoint is unreachable (e.g. dev server warming up).
  listExecutionEvents: (limit = 100) =>
    fetchJson<ExecutionEventDto[]>(`${platformUrls.aiGateway()}/telemetry/events?limit=${limit}`),
  getExecutionEvent: (executionId: string) =>
    fetchJson<ExecutionEventDto>(`${platformUrls.aiGateway()}/telemetry/events/${encodeURIComponent(executionId)}`),
};

// ---- Wire types (kept loose to avoid duplicating C# enums) ----
export type PluginStatus = 'Draft' | 'Testing' | 'Published' | 'Disabled';

export interface ApiSpecSummary {
  id: string;
  serviceName: string;
  displayName: string;
  baseAddress: string;
  importedAt: string;
  operationCount: number;
}

export interface ApiSpecDefinition extends ApiSpecSummary {
  openApiDocument: string;
}

export interface ApiOperation {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  parameters: PluginParameter[];
}

export type PluginParameterLocation = 'Path' | 'Query' | 'Header' | 'Body';

export interface PluginParameter {
  name: string;
  in: PluginParameterLocation;
  type: string;
  required: boolean;
  description?: string | null;
  defaultValue?: string | null;
}

export interface PluginEndpoint {
  operationId: string;
  method: string;
  path: string;
  toolName: string;
  toolDescription: string;
  parameters: PluginParameter[];
  responseSchemaJson?: string | null;
}

export type PluginAuthType = 'None' | 'ApiKey' | 'Bearer' | 'ClientCredentials';
export interface PluginAuthConfig {
  type: PluginAuthType;
  headerName?: string | null;
  secretName?: string | null;
}
export interface PluginPermissions {
  allowedAgents: string[];
  allowedTenants: string[];
  requiresApproval: boolean;
}
export interface PluginDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  apiSpecId: string;
  endpoints: PluginEndpoint[];
  auth: PluginAuthConfig;
  permissions: PluginPermissions;
  status: PluginStatus;
  createdAt: string;
  updatedAt: string;
}
export interface CreatePluginRequest {
  name: string;
  displayName: string;
  description: string;
  apiSpecId: string;
  operationIds: string[];
}
export interface UpdatePluginRequest {
  name: string;
  displayName: string;
  description: string;
  endpoints: PluginEndpoint[];
  auth: PluginAuthConfig;
  permissions: PluginPermissions;
}
export interface ImportApiSpecRequest {
  serviceName: string;
  displayName: string;
  openApiUrl: string;
}
export interface PlaygroundRequest {
  operationId: string;
  parameters: Record<string, string | null>;
}
export interface PlaygroundResponse {
  statusCode: number;
  contentType?: string | null;
  body: string;
  durationMs: number;
}
export interface AiPlaygroundRequest {
  message: string;
}
export interface AiPlaygroundToolCall {
  toolName: string;
  arguments: unknown;
  statusCode: number;
  contentType?: string | null;
  result?: unknown;
  durationMs: number;
  error?: string | null;
}
export interface AiPlaygroundResponse {
  reply: string;
  toolCalls: AiPlaygroundToolCall[];
  durationMs: number;
  error?: string | null;
}
export interface AgentDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  instructions: string;
  modelDeployment: string;
  pluginIds: string[];
  routingHints?: string[] | null;
}
export interface UpsertAgentRequest extends Omit<AgentDefinition, 'id'> {
  id?: string;
}
export interface LiveAgent {
  name: string;
  displayName: string;
  description: string;
  plugins: string[];
  tools: string[];
}
export interface LiveTool {
  name: string;
  pluginName: string;
  description: string;
  inputParameters: string[];
}
export interface ToolExecutionRecord {
  id: string;
  occurredAt: string;
  toolName: string;
  pluginName: string;
  method: string;
  path: string;
  agentName?: string | null;
  argumentsPreview: string;
  resultPreview: string;
  statusCode: number;
  durationMs: number;
  status: string;
  error?: string | null;
}
export interface AssistantDefinition {
  assistantId: string;
  displayName: string;
  application: string;
  description: string;
  agentNames: string[];
  defaultAgentName?: string | null;
  systemPreamble?: string | null;
  enabled: boolean;
}

/**
 * Wire shape returned by the AI Gateway's GET /telemetry/events endpoint. Mirrors the
 * C# ExecutionEventDto in MarketingAnalyticsAgentLab.RuntimeTelemetry.Contracts; do not
 * rename fields without updating the backend at the same time. Field-by-field equivalent
 * of the frontend ExecutionEvent in data/runtimeEvents.ts (sans the optional vectorSearch
 * which is reserved for a future iteration).
 */
export interface ExecutionEventDto {
  executionId: string;
  timestamp: string;
  tenantId: string;
  userId?: string | null;
  application: string;
  assistantId: string;
  agentId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  latencyMs: number;
  status: 'succeeded' | 'failed' | 'blocked';
  toolCalls: ExecutionToolCallDto[];
  policy: PolicyResultDto;
  routerReason?: string | null;
  traceId?: string | null;
}

export interface ExecutionToolCallDto {
  toolName: string;
  sourceMethod: string;
  sourcePath: string;
  latencyMs: number;
  status: 'succeeded' | 'failed' | 'denied';
}

export interface PolicyResultDto {
  permissionResult: 'allowed' | 'denied' | 'skipped';
  sensitiveFieldsFiltered: number;
  approvalRequired: boolean;
  blockedReason?: string | null;
}
