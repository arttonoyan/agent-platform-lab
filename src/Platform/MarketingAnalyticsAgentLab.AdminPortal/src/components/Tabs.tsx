import clsx from 'clsx';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number;
  hint?: string;
}

interface Props<T extends string> {
  tabs: TabItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  className?: string;
}

export default function Tabs<T extends string>({ tabs, active, onSelect, className }: Props<T>) {
  return (
    <div className={clsx('flex gap-1 border-b border-slate-200', className)}>
      {tabs.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          className={clsx(
            '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition',
            active === t.id
              ? 'border-brand-500 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
          title={t.hint}
        >
          {t.label}
          {typeof t.count === 'number' && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
