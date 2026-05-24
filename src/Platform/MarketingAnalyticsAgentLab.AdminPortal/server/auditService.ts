import { auditEvents as seedAudit } from '../src/data/audit';
import { executionTraces as seedExecutions } from '../src/data/executions';
import { appendJsonl, readJsonl, STORE_FILES } from './store';
import type { AuditEvent, ExecutionTrace } from './types';

/**
 * Audit + execution log.
 *
 * Each tool execution appends one `ExecutionTrace` to `executions.jsonl`. Each
 * governance change (publish, deprecate, source registered, etc.) appends one
 * `AuditEvent` to `audit.jsonl`. The Executions / Audit page reads both.
 *
 * Seed traces / audit events are returned in addition to real ones so the demo screen
 * is never empty on a fresh `.mvp-state/`.
 */

export async function recordExecution(trace: ExecutionTrace): Promise<void> {
  await appendJsonl(STORE_FILES.executions, trace);
}

export async function recordAudit(event: AuditEvent): Promise<void> {
  await appendJsonl(STORE_FILES.audit, event);
}

export async function listExecutions(): Promise<ExecutionTrace[]> {
  const real = await readJsonl<ExecutionTrace>(STORE_FILES.executions);
  // Real first (most recent matters most), then seed for context.
  const sorted = [...real].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return [...sorted, ...seedExecutions];
}

export async function getExecution(id: string): Promise<ExecutionTrace | undefined> {
  const all = await listExecutions();
  return all.find(e => e.id === id);
}

export async function listAuditEvents(): Promise<AuditEvent[]> {
  const real = await readJsonl<AuditEvent>(STORE_FILES.audit);
  const sorted = [...real].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return [...sorted, ...seedAudit];
}
