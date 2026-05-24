import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, Clock, ShieldOff, Wrench } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { api, platformUrls, type ToolExecutionRecord } from '../lib/platform';

interface RegistryEvent {
  type: string;
  entityId?: string | null;
  displayName?: string | null;
  occurredAt: string;
}

/**
 * Activity / Executions is the operator's "what just happened" view. Three panes today:
 * recent tool executions (newest first, bounded buffer from McpServer's ExecutionLog),
 * the SSE feed of registry lifecycle events, and the catalog of currently-live tools.
 * Built to absorb a real execution-trace pipeline later without changing the layout.
 */
export default function ActivityPage() {
  const [events, setEvents] = useState<RegistryEvent[]>([]);
  const live = useQuery({ queryKey: ['live-tools'], queryFn: () => api.listLiveTools(), refetchInterval: 5_000 });
  const executions = useQuery({
    queryKey: ['tool-executions'],
    queryFn: () => api.listToolExecutions(50),
    refetchInterval: 5_000,
  });

  useEffect(() => {
    const base = platformUrls.pluginRegistry();
    if (!base) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${base}/events`, { headers: { accept: 'text/event-stream' }, signal: ctrl.signal });
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep;
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const raw = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const data = raw.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
            if (!data) continue;
            try {
              const evt = JSON.parse(data) as RegistryEvent;
              setEvents(prev => [evt, ...prev].slice(0, 80));
            } catch { /* ignore */ }
          }
        }
      } catch { /* aborted */ }
    })();
    return () => ctrl.abort();
  }, []);

  return (
    <>
      <PageHeader
        title="Activity / Executions"
        subtitle="Recent tool executions, registry events, and currently-loaded tools. Updated every 5 seconds."
      />
      <div className="space-y-6 p-8">
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">Recent tool executions</h2>
          <p className="mb-3 text-xs text-slate-500">
            Captured by the Tool Runtime for every MCP tool invocation. Bounded in-memory buffer - a
            future tracing pipeline can replace this source without changing the UI.
          </p>
          <div className="card">
            {executions.isPending && (
              <p className="px-5 py-3 text-sm text-slate-500">Loading...</p>
            )}
            {executions.error && (
              <p className="px-5 py-3 text-sm text-rose-600">{(executions.error as Error).message}</p>
            )}
            {executions.data && executions.data.length === 0 && (
              <p className="px-5 py-3 text-sm text-slate-500">
                No executions captured yet. Run an agent through DevUI or the gateway to populate this list.
              </p>
            )}
            <ul className="divide-y divide-slate-100">
              {executions.data?.map(e => (
                <li key={e.id} className="px-5 py-3 text-sm">
                  <ExecutionRow record={e} />
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-6">
          <div className="card">
            <div className="card-header flex items-center gap-2">
              <Activity size={14} /> Registry events
            </div>
            <ul className="divide-y divide-slate-100">
              {events.map((e, i) => (
                <li key={i} className="px-5 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-brand-700">{e.type}</span>
                    <span className="text-xs text-slate-400">{new Date(e.occurredAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-xs text-slate-500">{e.displayName ?? e.entityId}</div>
                </li>
              ))}
              {events.length === 0 && <li className="px-5 py-3 text-sm text-slate-500">Waiting for events...</li>}
            </ul>
          </div>

          <div className="card">
            <div className="card-header flex items-center gap-2">
              <Wrench size={14} /> Live tools
            </div>
            <ul className="divide-y divide-slate-100">
              {live.data?.map(t => (
                <li key={t.name} className="px-5 py-2 text-sm">
                  <div className="font-mono text-slate-900">{t.name}</div>
                  <div className="text-xs text-slate-500">tool set: <span className="font-mono">{t.pluginName}</span></div>
                </li>
              ))}
              {live.data?.length === 0 && <li className="px-5 py-3 text-sm text-slate-500">No published Tool Sets yet.</li>}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

function ExecutionRow({ record }: { record: ToolExecutionRecord }) {
  const ok = record.status === 'success';
  const denied = record.status === 'policy-denied';
  const Icon = ok ? CheckCircle2 : denied ? ShieldOff : AlertTriangle;
  const tone = ok
    ? 'text-emerald-700 bg-emerald-50'
    : denied
      ? 'text-violet-700 bg-violet-50'
      : 'text-amber-700 bg-amber-50';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`pill font-mono ${tone}`}>
          <Icon size={12} className="mr-1 inline" />
          {record.status}
        </span>
        <span className="pill bg-slate-100 text-slate-700 font-mono">{record.method}</span>
        <span className="font-mono text-sm font-semibold text-slate-900">{record.toolName}</span>
        <span className="font-mono text-xs text-slate-500">{record.path}</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
          <Clock size={12} /> {record.durationMs} ms
          <span className="ml-2">{new Date(record.occurredAt).toLocaleTimeString()}</span>
        </span>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        tool set: <span className="font-mono">{record.pluginName}</span>
        {record.agentName && (
          <>
            {' '}· agent: <span className="font-mono">{record.agentName}</span>
          </>
        )}
        {record.statusCode > 0 && (
          <>
            {' '}· http: <span className="font-mono">{record.statusCode}</span>
          </>
        )}
      </div>
      {(record.argumentsPreview || record.resultPreview || record.error) && (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {record.argumentsPreview && (
            <PreviewBlock label="arguments" value={record.argumentsPreview} />
          )}
          {(record.error || record.resultPreview) && (
            <PreviewBlock label={record.error ? 'error' : 'response'} value={record.error ?? record.resultPreview} />
          )}
        </div>
      )}
    </div>
  );
}

function PreviewBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <pre className="mt-1 max-h-32 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-[11px] whitespace-pre-wrap break-all">
        {value}
      </pre>
    </div>
  );
}
