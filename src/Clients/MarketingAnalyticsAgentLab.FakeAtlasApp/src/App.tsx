import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, Wrench } from 'lucide-react';
import clsx from 'clsx';

const ASSISTANT_ID = 'marketing_analytics_assistant';
const TENANT_ID = 'tenant-001';
const USER_ID = 'demo-user-001';
const APPLICATION = 'marketing';
const PAGE = 'campaigns';

const SUGGESTIONS = [
  'Show email delivery performance for this week',
  'Find campaigns with low open rate',
  'Send a test notification',
  'Summarize customer engagement',
];

function serviceUrl(name: string): string {
  const envs = import.meta.env as unknown as Record<string, string | undefined>;
  for (const key of [`services__${name}__https__0`, `services__${name}__http__0`]) {
    const v = envs[key];
    if (v) return v.replace(/\/$/, '');
  }
  return envs.VITE_AI_GATEWAY_URL ?? '';
}

interface AssistantToolCall {
  plugin: string;
  tool: string;
  argumentsJson?: string | null;
  resultPreview?: string | null;
  durationMs?: number | null;
}
interface AssistantInteractionResponse {
  conversationId: string;
  assistantId: string;
  selectedAgent: string;
  message: string;
  toolCalls: AssistantToolCall[];
  routerReason?: string | null;
  traceId?: string | null;
}

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  selectedAgent?: string;
  routerReason?: string | null;
  toolCalls?: AssistantToolCall[];
  traceId?: string | null;
  pending?: boolean;
  error?: string;
}

export default function App() {
  const [conversationId] = useState(() => crypto.randomUUID());
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');

    const userTurn: ChatTurn = { id: crypto.randomUUID(), role: 'user', text: message };
    const placeholderId = crypto.randomUUID();
    const placeholder: ChatTurn = { id: placeholderId, role: 'assistant', text: '', pending: true };
    setTurns(t => [...t, userTurn, placeholder]);
    setBusy(true);

    try {
      const url = `${serviceUrl('ai-gateway')}/assistant/api/interaction/message`;
      const body = {
        assistantId: ASSISTANT_ID,
        tenantId: TENANT_ID,
        message,
        conversationId,
        context: { application: APPLICATION, page: PAGE, userId: USER_ID },
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${res.status} ${res.statusText} - ${errText}`);
      }
      const data: AssistantInteractionResponse = await res.json();
      setTurns(t => t.map(turn =>
        turn.id === placeholderId
          ? {
              ...turn,
              text: data.message,
              selectedAgent: data.selectedAgent,
              routerReason: data.routerReason,
              toolCalls: data.toolCalls,
              traceId: data.traceId,
              pending: false,
            }
          : turn,
      ));
    } catch (err) {
      setTurns(t => t.map(turn =>
        turn.id === placeholderId
          ? { ...turn, pending: false, error: (err as Error).message }
          : turn,
      ));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col p-6">
      <header className="rounded-t-2xl bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
              <Sparkles size={14} /> Atlas Demo Client
            </div>
            <div className="mt-0.5 text-lg font-semibold text-slate-900">Marketing Analytics Assistant</div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-atlas-50 px-3 py-1 font-mono text-atlas-700">{ASSISTANT_ID}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">page: {PAGE}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">tenant: {TENANT_ID}</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Demo client only. All requests go to <span className="font-mono">POST /assistant/api/interaction/message</span> on the AI Assistant Gateway.
        </p>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-auto bg-white px-6 py-6 shadow-sm">
        {turns.length === 0 && <EmptyState onPick={send} />}
        {turns.map(turn => (
          <TurnBubble key={turn.id} turn={turn} />
        ))}
      </div>

      <div className="rounded-b-2xl bg-white px-6 py-4 shadow-sm">
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={busy}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:border-atlas-400 hover:text-atlas-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void send(); }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask the Marketing Analytics Assistant..."
            disabled={busy}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm shadow-sm focus:border-atlas-500 focus:outline-none focus:ring-2 focus:ring-atlas-500/30"
          />
          <button
            type="submit"
            disabled={busy || input.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-atlas-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-atlas-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={16} /> Send
          </button>
        </form>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="flex h-full items-center justify-center text-center">
      <div>
        <Bot className="mx-auto text-slate-400" size={36} />
        <div className="mt-3 font-medium text-slate-700">Ask the assistant anything</div>
        <div className="mt-1 text-sm text-slate-500">Try one of the suggestions below or type your own message.</div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => onPick(s)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-atlas-400 hover:text-atlas-700">{s}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TurnBubble({ turn }: { turn: ChatTurn }) {
  return (
    <div className={clsx('flex', turn.role === 'user' ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed',
          turn.role === 'user' ? 'bg-atlas-600 text-white' : 'bg-slate-100 text-slate-900',
        )}
      >
        {turn.pending && <span className="text-slate-400">thinking...</span>}
        {turn.error && <span className="text-rose-600">{turn.error}</span>}
        {turn.text && <div className="whitespace-pre-wrap">{turn.text}</div>}
        {turn.role === 'assistant' && turn.selectedAgent && (
          <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">Routed to:</span>
              <span className="rounded-full bg-atlas-100 px-2 py-0.5 font-mono text-atlas-700" title={turn.routerReason ?? ''}>{turn.selectedAgent}</span>
            </div>
            {turn.toolCalls && turn.toolCalls.length > 0 && (
              <details className="text-slate-700">
                <summary className="cursor-pointer font-semibold text-slate-600">
                  Tool calls ({turn.toolCalls.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {turn.toolCalls.map((tc, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Wrench size={12} className="mt-0.5 text-slate-500" />
                      <div>
                        <div>
                          <span className="font-mono">{tc.tool}</span>
                          <span className="text-slate-500"> · plugin <span className="font-mono">{tc.plugin}</span></span>
                          {tc.durationMs != null && <span className="text-slate-400"> · {tc.durationMs}ms</span>}
                        </div>
                        {tc.argumentsJson && <pre className="mt-0.5 max-w-full overflow-x-auto rounded bg-white p-1 font-mono text-[10px] text-slate-600">{tc.argumentsJson}</pre>}
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {turn.traceId && (
              <div className="text-[10px] text-slate-400">
                traceId <span className="font-mono">{turn.traceId}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
