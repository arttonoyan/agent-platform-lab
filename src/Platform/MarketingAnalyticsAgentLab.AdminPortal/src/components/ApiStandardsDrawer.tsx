import { BookOpen, Check, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface StandardSection {
  title: string;
  bullets: string[];
}

const STANDARDS: StandardSection[] = [
  {
    title: 'OpenAPI document',
    bullets: [
      'OpenAPI 3.x; published at a stable URL the platform can fetch on demand.',
      'Each operation must have a unique `operationId` in `lowerCamelCase` or `PascalCase`.',
      '`summary` is a one-line, outcome-oriented label - it surfaces directly in the LLM prompt.',
      '`description` may be longer and explain when to use the operation.',
    ],
  },
  {
    title: 'Tagging & grouping',
    bullets: [
      'Group operations by domain via `tags` - one tag per module (e.g. `analytics`, `campaigns`).',
      'Use the `x-st-product` and `x-st-module` extensions when the tag is not enough.',
      'Mark stability with `x-st-stability: stable | beta | deprecated`.',
    ],
  },
  {
    title: 'Read vs write',
    bullets: [
      'Read endpoints (GET) can be published as tools for MVP without approval.',
      'Write endpoints (POST/PUT/PATCH/DELETE) must declare `x-st-write-safety` and require approval.',
      'Destructive endpoints should accept a `dryRun` flag where it makes sense.',
    ],
  },
  {
    title: 'Schemas & PII',
    bullets: [
      'Every parameter and response field must have a `description`.',
      'Mark fields containing PII with `x-st-pii: true`; the runtime auto-redacts them.',
      'Prefer fixed enums over free-text strings for status / type fields.',
    ],
  },
];

/**
 * Right-side drawer that documents the OpenAPI conventions the platform expects from
 * registered sources. Lives behind a small "API Standards" button on the API Catalog
 * header so it stays out of the way while still being one click for new product teams.
 */
export default function ApiStandardsDrawer({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex">
      <button
        type="button"
        aria-label="Close API Standards drawer"
        className="flex-1 bg-slate-900/30"
        onClick={onClose}
      />
      <aside className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-brand-700">
              <BookOpen size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">API Standards</div>
              <div className="text-xs text-slate-500">
                What an OpenAPI source must look like to register cleanly into the catalog.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
          {STANDARDS.map(section => (
            <section key={section.title}>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{section.title}</div>
              <ul className="mt-2 space-y-1.5">
                {section.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-700">
                    <Check size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            The full conventions document lives in <span className="font-mono">docs/api-standards.md</span>.
            New OpenAPI sources can be registered without satisfying every rule, but tools generated
            from non-compliant sources will be flagged on the Endpoints tab.
          </p>
        </div>
      </aside>
    </div>
  );
}
