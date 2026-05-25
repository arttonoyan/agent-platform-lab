import type { ReactNode } from 'react';

/**
 * Shared tab strip used by the new Tools page and by the Tool Set / Endpoint detail
 * pages. Kept tiny on purpose — every section in this app uses the same underlined-tab
 * look, so a single component keeps that consistent and avoids dup CSS.
 */
export interface TabSpec<TId extends string> {
  id: TId;
  label: ReactNode;
  count?: number;
  /** Render at the end of the label, after any badge. */
  trailing?: ReactNode;
  disabled?: boolean;
  title?: string;
}

interface Props<TId extends string> {
  tabs: TabSpec<TId>[];
  active: TId;
  onChange: (id: TId) => void;
  className?: string;
}

export default function Tabs<TId extends string>({ tabs, active, onChange, className }: Props<TId>) {
  return (
    <div className={`flex gap-1 border-b border-slate-200 ${className ?? ''}`} role="tablist">
      {tabs.map(t => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={t.disabled}
            title={t.title}
            onClick={() => onChange(t.id)}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isActive
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>{t.label}</span>
            {typeof t.count === 'number' && (
              <span className="pill bg-slate-100 text-slate-600">{t.count}</span>
            )}
            {t.trailing}
          </button>
        );
      })}
    </div>
  );
}
