import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, AlertTriangle, Bot, ExternalLink, FlaskConical, Play, ShieldAlert, Wrench } from 'lucide-react';
import clsx from 'clsx';
import EmptyState from '../../../components/EmptyState';
import JsonBlock from '../../../components/JsonBlock';
import Badge from '../../../components/Badge';
import { ToolStatusBadge } from '../../../components/StatusBadge';
import { playgroundApi, toolsApi, type PlaygroundCallResult } from '../../../services/api';
import type { Endpoint } from '../../../data/types';

type Mode = 'http' | 'llm';

const modes: { id: Mode; label: string; Icon: typeof Play; hint: string }[] = [
  { id: 'http', label: 'HTTP',          Icon: Play, hint: 'Real call against the standalone API with your configured defaults.' },
  { id: 'llm',  label: 'LLM',           Icon: Bot,  hint: 'Tests whether the tool description leads the LLM to call this tool.' },
];

interface Props {
  endpoint: Endpoint;
  hasConfiguration: boolean;
  onConfigureAsTool: () => void;
}

export default function PlaygroundTab({ endpoint, hasConfiguration, onConfigureAsTool }: Props) {
  const [mode, setMode] = useState<Mode>('http');
  const config = useQuery({
    queryKey: ['config', endpoint.id],
    queryFn: () => toolsApi.getOrCreateConfiguration(endpoint.id),
    enabled: hasConfiguration,
  });
  const draftState = useQuery({
    queryKey: ['endpoint.draft', endpoint.id],
    queryFn: () => toolsApi.getDraftState(endpoint.id),
  });

  if (!hasConfiguration) {
    return (
      <EmptyState
        Icon={Wrench}
        title="Create a tool configuration first"
        description="The Playground tests the ToolDefinition you create from this endpoint. There is no saved tool configuration yet — start one on the Tool Configuration tab."
        action={
          <button className="btn" onClick={onConfigureAsTool}>
            <Wrench size={14} /> Configure as Tool <ArrowRight size={14} />
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-brand-900">
        <div className="flex items-start gap-2">
          <FlaskConical size={16} className="mt-0.5 shrink-0 text-brand-700" />
          <div className="flex-1">
            <div className="font-medium">
              Testing tool <span className="font-mono">{draftState.data?.toolName ?? config.data?.toolName ?? '(unsaved draft)'}</span>
            </div>
            <div className="mt-0.5 text-xs">
              The Playground runs the <strong>ToolDefinition</strong> created from this endpoint — not the raw API. Use the HTTP mode to verify path / params / auth, and the LLM mode to verify the tool description.
            </div>
          </div>
          {draftState.data?.status && <ToolStatusBadge status={draftState.data.status} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {modes.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
                mode === m.id ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              <m.Icon size={14} /> {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{modes.find(m => m.id === mode)?.hint}</p>
      </div>

      {mode === 'http' && <HttpPlayground endpoint={endpoint} />}
      {mode === 'llm'  && <LlmPlayground  endpoint={endpoint} toolName={config.data?.toolName ?? ''} />}
    </div>
  );
}

// ----------------------------------------------------------------------- HTTP

function HttpPlayground({ endpoint }: { endpoint: Endpoint }) {
  const qc = useQueryClient();
  const initial = useMemo(
    () => Object.fromEntries(endpoint.parameters.map(p => [p.name, p.example != null ? String(p.example) : ''])),
    [endpoint],
  );
  const [params, setParams] = useState<Record<string, string>>(initial);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PlaygroundCallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setParams(initial); setResult(null); setError(null); }, [initial]);

  const writeBlocked = endpoint.method !== 'GET';
  const seedBlocked  = !!endpoint.isSeed;
  const willBlock = writeBlocked || seedBlocked;

  async function run() {
    setRunning(true); setError(null);
    try {
      const res = await playgroundApi.call(endpoint.id, params);
      setResult(res);
      // The BFF wrote an audit entry — refresh anything that lists executions.
      qc.invalidateQueries({ queryKey: ['executions'] });
      qc.invalidateQueries({ queryKey: ['metrics'] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      {seedBlocked && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-700" />
            <div>
              <div className="font-medium">Sample endpoint — execution is mocked</div>
              <div className="mt-1 text-xs">
                This endpoint is from the seed catalog. Register a real OpenAPI source on the{' '}
                <Link to="/api-catalog/sources" className="font-medium underline">Sources</Link> tab to enable real execution.
              </div>
            </div>
          </div>
        </div>
      )}
      {writeBlocked && !seedBlocked && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
            <div>
              <div className="font-medium">{endpoint.method} tools require approval — disabled in MVP</div>
              <div className="mt-1 text-xs">
                You can still build the request and inspect the full preview. The Tool Runtime will not actually send {endpoint.method} requests until human-approval gating is implemented in a later milestone.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card">
          <div className="card-header flex items-center justify-between">
            <span>Invoke</span>
            {!willBlock && <Badge tone="success">live execution</Badge>}
            {willBlock && <Badge tone="warning">preview only</Badge>}
          </div>
          <div className="space-y-3 p-5">
            {endpoint.parameters.length === 0 && (
              <p className="text-sm text-slate-500">No parameters required.</p>
            )}
            {endpoint.parameters.map(p => (
              <label key={`${p.name}-${p.in}`} className="label">
                {p.name}{' '}
                <span className="text-slate-400">
                  ({p.in}, {p.type}{p.required ? ', required' : ''})
                </span>
                <input
                  className="input mt-1"
                  value={params[p.name] ?? ''}
                  onChange={e => setParams({ ...params, [p.name]: e.target.value })}
                  placeholder={p.description}
                />
              </label>
            ))}
            <button className="btn mt-2" onClick={run} disabled={running}>
              <Play size={14} /> {running ? 'Running…' : willBlock ? 'Preview request' : 'Run request'}
            </button>
            <p className="text-[11px] text-slate-500">
              Request is built and executed by the Tool Runtime on the server. The browser never touches the upstream API directly.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          {error && (
            <div className="card border-rose-200 p-5 text-sm text-rose-800">{error}</div>
          )}
          {result && (
            <div className="card p-5">
              {result.blockedReason && (
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <strong>Blocked by Tool Runtime:</strong> {result.blockedReason}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <Badge tone={result.statusCode >= 200 && result.statusCode < 300 ? 'success' : result.blockedReason ? 'warning' : 'danger'} mono>
                  {result.statusCode === 0 ? 'preview' : result.statusCode}
                </Badge>
                <span className="text-slate-500">{result.durationMs} ms</span>
                <span className="text-slate-500">{result.contentType}</span>
                <span className="ml-auto font-mono text-[11px] text-slate-500 break-all">{result.request.method} {result.request.url}</span>
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="section-title">Request preview</div>
                  <JsonBlock value={{ headers: result.request.headers, body: result.request.body }} language="http" maxHeight="14rem" />
                </div>
                <div>
                  <div className="section-title">Response body</div>
                  <JsonBlock value={result.body} maxHeight="24rem" />
                </div>
                {result.executionId && (
                  <div className="text-xs text-slate-500">
                    Recorded as{' '}
                    <Link to={`/executions/${result.executionId}`} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:text-brand-900">
                      execution {result.executionId} <ExternalLink size={11} />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
          {!result && !error && (
            <div className="card p-6 text-sm text-slate-500">
              Build the request on the left and press <strong>{willBlock ? 'Preview request' : 'Run request'}</strong>.
              {!willBlock && ' The Tool Runtime executes server-side, applies source auth, returns the body, and records an audit entry.'}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------- LLM

function LlmPlayground({ endpoint, toolName }: { endpoint: Endpoint; toolName: string }) {
  const config = useQuery({
    queryKey: ['config', endpoint.id],
    queryFn: () => toolsApi.getOrCreateConfiguration(endpoint.id),
  });
  const [prompt, setPrompt] = useState(suggestPrompt(endpoint));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof playgroundApi.askAi>> | null>(null);

  async function run() {
    if (!config.data) return;
    setRunning(true);
    try {
      setResult(await playgroundApi.askAi(endpoint, config.data, prompt));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="card">
        <div className="card-header">Ask the model</div>
        <div className="space-y-3 p-5">
          <label className="label">
            User prompt
            <textarea
              className="input mt-1 resize-y"
              rows={4}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
            />
          </label>
          <p className="text-xs text-slate-500">
            The LLM sees only this tool — useful for proving the tool description is precise enough that the model actually picks it.
          </p>
          <button className="btn" onClick={run} disabled={running || !prompt.trim()}>
            <Bot size={14} /> {running ? 'Asking…' : 'Run with LLM'}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        {result && (
          <div className="card p-5">
            <div className="flex items-center gap-2 text-xs">
              <Badge tone={result.toolCalled ? 'success' : 'warning'}>
                {result.toolCalled ? `Called ${toolName}` : 'No tool call'}
              </Badge>
              <span className="text-slate-500">{result.durationMs} ms</span>
            </div>
            {result.toolCalled ? (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="section-title">Tool call</div>
                  <JsonBlock value={{ tool: result.toolName, arguments: result.arguments }} maxHeight="14rem" />
                </div>
                <div>
                  <div className="section-title">Model reply</div>
                  <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">{result.reply}</p>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {result.reply}
              </div>
            )}
          </div>
        )}
        {!result && (
          <div className="card p-6 text-sm text-slate-500">
            Type a natural-language question and press <strong>Run with LLM</strong>. If the LLM doesn't call the tool, tighten the tool description on the Tool Configuration tab.
          </div>
        )}
      </section>
    </div>
  );
}

function suggestPrompt(endpoint: Endpoint): string {
  const sum = endpoint.summary.toLowerCase();
  if (sum.includes('open rate'))    return 'What was our open rate over the last 14 days?';
  if (sum.includes('delivery'))     return 'How is email delivery looking over the last week?';
  if (sum.includes('list'))         return `Show me everything in ${endpoint.summary.toLowerCase()}.`;
  if (sum.includes('availability')) return 'Find the next available technician for tomorrow morning.';
  if (sum.includes('telemetry'))    return 'Is vehicle veh_142 below 25% fuel right now?';
  return `Use this tool to answer a typical operator question about ${endpoint.summary.toLowerCase()}.`;
}
