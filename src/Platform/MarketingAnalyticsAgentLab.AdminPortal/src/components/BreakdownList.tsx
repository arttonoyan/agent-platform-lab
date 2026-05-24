import type { BreakdownRow } from '../data/runtimeMetrics';

interface Props {
  title: string;
  /** Optional one-line subtitle under the title. */
  subtitle?: string;
  rows: BreakdownRow[];
  /** How to render the numeric value next to each bar. */
  format?: (n: number) => string;
  /** Max rows to show before "+ N more". */
  limit?: number;
  /** Empty-state message. */
  emptyLabel?: string;
}

const defaultFormat = (n: number) => n.toLocaleString();

/**
 * Title + horizontal "bars" list. Intentionally not a chart: bars are width-percent
 * spans of the row's value over the max, which keeps the dashboard scannable without
 * dragging in a chart library.
 */
export default function BreakdownList({
  title,
  subtitle,
  rows,
  format = defaultFormat,
  limit = 6,
  emptyLabel = 'No data yet.',
}: Props) {
  const visible = rows.slice(0, limit);
  const hidden  = Math.max(rows.length - limit, 0);
  const max = visible.reduce((m, r) => Math.max(m, r.value), 0);

  return (
    <div className="card">
      <div className="card-header">
        {title}
        {subtitle && <div className="mt-0.5 text-xs font-normal text-slate-500">{subtitle}</div>}
      </div>
      <div className="px-5 py-3">
        {visible.length === 0 && <p className="text-sm text-slate-500">{emptyLabel}</p>}
        <ul className="space-y-2">
          {visible.map(row => {
            const pct = max === 0 ? 0 : Math.max(2, Math.round((row.value / max) * 100));
            return (
              <li key={row.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-mono text-xs text-slate-700">{row.label}</span>
                  <span className="shrink-0 tabular-nums text-slate-900">{format(row.value)}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        {hidden > 0 && (
          <div className="mt-2 text-xs text-slate-500">+ {hidden} more</div>
        )}
      </div>
    </div>
  );
}
