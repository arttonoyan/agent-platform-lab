/**
 * Server-side type re-exports.
 *
 * The BFF and the React app share one domain model: `src/data/types.ts`. We re-export
 * here so server code can import from `./types` rather than reaching across the project,
 * and so we have one obvious place to add server-only types (request shapes, etc.).
 */

export type {
  AgentDefinition,
  AgentStatus,
  AuditAction,
  AuditEvent,
  Endpoint,
  ExecutionStatus,
  ExecutionToolCall,
  ExecutionTrace,
  GatewayAssistant,
  GatewayInvocationSummary,
  GatewayPolicy,
  GatewayRateLimit,
  HttpMethod,
  IngestionKind,
  IngestionSource,
  KnowledgeSource,
  KnowledgeStatus,
  Module,
  OpenApiAuthKind,
  OpenApiSource,
  OpenApiSourceAuth,
  OpenApiSourceStatus,
  ParameterDefinition,
  PlatformMetrics,
  Product,
  ProductDomain,
  RegistryTool,
  Stability,
  ToolConfiguration,
  ToolDraftState,
  ToolPermissions,
  ToolPolicy,
  ToolStatus,
  VectorProvider,
  WorkflowStep,
  WriteSafety,
} from '../src/data/types';

// -------------------------------------------------------------------------------------
// Server-only request / response shapes
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
    kind: 'none' | 'apiKey' | 'bearer';
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
    kind: 'none' | 'apiKey' | 'bearer';
    headerName?: string;
    secret?: string;
  };
}

export interface RunToolRequest {
  endpointId: string;
  parameters: Record<string, string>;
}

export interface PlaygroundCallResult {
  statusCode: number;
  durationMs: number;
  contentType: string;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  };
  body: unknown;
  /**
   * Only set when the runtime refused to execute (e.g. write tool in MVP mode).
   * The UI displays this as a yellow banner above the request preview.
   */
  blockedReason?: string;
  /** Trace id of the execution record stored in audit; lets the UI link to it. */
  executionId?: string;
}
