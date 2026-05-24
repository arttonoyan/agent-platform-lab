import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  Icon?: LucideIcon;
  trend?: string;
  trendTone?: 'success' | 'danger' | 'neutral';
}

const trendTones = {
  success: 'text-emerald-700',
  danger:  'text-rose-700',
  neutral: 'text-slate-500',
};

export default function MetricCard({ label, value, hint, Icon, trend, trendTone = 'neutral' }: Props) {
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
        {Icon && (
          <div className="rounded-md bg-brand-50 p-1.5 text-brand-600">
            <Icon size={14} />
          </div>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {trend && <span className={clsx('font-medium', trendTones[trendTone])}>{trend}</span>}
        {hint && <span className="text-slate-500">{hint}</span>}
      </div>
    </div>
  );
}
