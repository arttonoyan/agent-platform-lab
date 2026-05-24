import Badge, { type BadgeTone } from './Badge';
import type {
  AgentStatus,
  ExecutionStatus,
  KnowledgeStatus,
  Stability,
  ToolStatus,
  WriteSafety,
} from '../data/types';

const toolStatusTone: Record<ToolStatus, BadgeTone> = {
  Draft:      'neutral',
  InReview:   'warning',
  Published:  'success',
  Deprecated: 'danger',
};

const agentStatusTone: Record<AgentStatus, BadgeTone> = {
  Draft:     'neutral',
  Published: 'success',
  Disabled:  'danger',
};

const stabilityTone: Record<Stability, BadgeTone> = {
  stable:     'success',
  beta:       'warning',
  deprecated: 'danger',
  internal:   'purple',
};

const knowledgeTone: Record<KnowledgeStatus, BadgeTone> = {
  Indexed:  'success',
  Indexing: 'info',
  Failed:   'danger',
  Stale:    'warning',
};

const writeSafetyTone: Record<WriteSafety, BadgeTone> = {
  read:        'info',
  write:       'warning',
  destructive: 'danger',
};

const executionTone: Record<ExecutionStatus, BadgeTone> = {
  'success':       'success',
  'tool-error':    'warning',
  'policy-denied': 'danger',
  'llm-error':     'danger',
  'timeout':       'warning',
};

export function ToolStatusBadge({ status }: { status: ToolStatus }) {
  return <Badge tone={toolStatusTone[status]}>{status}</Badge>;
}

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  return <Badge tone={agentStatusTone[status]}>{status}</Badge>;
}

export function StabilityBadge({ stability }: { stability: Stability }) {
  return <Badge tone={stabilityTone[stability]}>{stability}</Badge>;
}

export function KnowledgeStatusBadge({ status }: { status: KnowledgeStatus }) {
  return <Badge tone={knowledgeTone[status]}>{status}</Badge>;
}

export function WriteSafetyBadge({ writeSafety }: { writeSafety: WriteSafety }) {
  return <Badge tone={writeSafetyTone[writeSafety]}>{writeSafety}</Badge>;
}

export function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
  return <Badge tone={executionTone[status]}>{status}</Badge>;
}
