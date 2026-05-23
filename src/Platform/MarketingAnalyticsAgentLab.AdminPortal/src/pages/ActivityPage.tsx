import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { api, platformUrls } from '../lib/platform';

interface RegistryEvent {
  type: string;
  entityId?: string | null;
  displayName?: string | null;
  occurredAt: string;
}

export default function ActivityPage() {
  const [events, setEvents] = useState<RegistryEvent[]>([]);
  const live = useQuery({ queryKey: ['live-tools'], queryFn: () => api.listLiveTools(), refetchInterval: 5_000 });

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
        title="Activity"
        subtitle="Live registry events + currently-loaded MCP tools."
      />
      <div className="grid grid-cols-2 gap-6 p-8">
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
          <div className="card-header">Live MCP tools</div>
          <ul className="divide-y divide-slate-100">
            {live.data?.map(t => (
              <li key={t.name} className="px-5 py-2 text-sm">
                <div className="font-mono text-slate-900">{t.name}</div>
                <div className="text-xs text-slate-500">plugin: <span className="font-mono">{t.pluginName}</span></div>
              </li>
            ))}
            {live.data?.length === 0 && <li className="px-5 py-3 text-sm text-slate-500">No published plugins yet.</li>}
          </ul>
        </div>
      </div>
    </>
  );
}
