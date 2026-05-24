import type { LucideIcon } from 'lucide-react';

interface Props {
  label: string;
  value: string;
  /** Optional sub-line under the value (e.g. "today" or "12 denied"). */
  hint?: string;
  icon?: LucideIcon;
  /** Visual emphasis: 'default' (slate) | 'good' | 'warn' | 'danger'. */
  tone?: 'default' | 'good' | 'warn' | 'danger';
}

const toneIcon: Record<Required<Props>['tone'], string> = {
  default: 'bg-slate-100 text-slate-600',
  good:    'bg-emerald-50 text-emerald-700',
  warn:    'bg-amber-50 text-amber-700',
  danger:  'bg-rose-50 text-rose-700',
};

/**
 * Compact card used by the AI Runtime Dashboard. Same look across all top metrics so
 * leadership eyes can scan the row without re-orienting on every card.
 */
export default function MetricCard({ label, value, hint, icon: Icon, tone = 'default' }: Props) {
  return (
    <div className="card flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        {Icon && (
          <div className={`flex h-7 w-7 items-center justify-center rounded-md ${toneIcon[tone]}`}>
            <Icon size={14} />
          </div>
        )}
      </div>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
