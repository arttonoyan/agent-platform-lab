import clsx from 'clsx';
import { ChevronRight, type LucideIcon } from 'lucide-react';

export interface FlowStep {
  id: string;
  label: string;
  hint?: string;
  Icon: LucideIcon;
  tone?: 'brand' | 'neutral' | 'success';
}

const tones = {
  brand:   'border-brand-200 bg-brand-50 text-brand-800',
  neutral: 'border-slate-200 bg-white text-slate-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

interface Props {
  steps: FlowStep[];
  className?: string;
}

export default function FlowDiagram({ steps, className }: Props) {
  return (
    <div className={clsx('flex w-full flex-wrap items-stretch gap-2', className)}>
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div className={clsx('flex min-w-[140px] flex-col rounded-lg border px-3 py-2.5 shadow-sm', tones[s.tone ?? 'neutral'])}>
            <div className="flex items-center gap-2">
              <s.Icon size={14} />
              <span className="text-xs font-semibold uppercase tracking-wider">{s.label}</span>
            </div>
            {s.hint && <div className="mt-1 text-[11px] leading-snug text-slate-600">{s.hint}</div>}
          </div>
          {i < steps.length - 1 && <ChevronRight size={18} className="text-slate-300" />}
        </div>
      ))}
    </div>
  );
}
