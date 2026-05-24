import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface Props {
  value: unknown;
  language?: 'json' | 'http' | 'text';
  className?: string;
  maxHeight?: string;
}

/**
 * Read-only JSON / code block with a copy button. Used by the Playground response
 * viewer and the execution-trace detail tool-call viewer.
 */
export default function JsonBlock({ value, language = 'json', className, maxHeight = '24rem' }: Props) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard may fail in non-secure contexts; the user can select manually. */
    }
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
        <span>{language}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
        >
          {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        className="overflow-auto rounded-b-lg border border-slate-200 bg-slate-900 p-3 text-[12px] leading-relaxed text-slate-100"
        style={{ maxHeight }}
      >
{text}
      </pre>
    </div>
  );
}
