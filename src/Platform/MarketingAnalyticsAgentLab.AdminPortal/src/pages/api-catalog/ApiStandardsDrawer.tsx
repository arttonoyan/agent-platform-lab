import { useEffect } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Compass,
  FileJson2,
  Info,
  ListChecks,
  Server,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import Badge from '../../components/Badge';
import SectionTitle from '../../components/SectionTitle';

/**
 * API Standards — right-side slide-in drawer.
 *
 * Reference content (not a daily workflow surface) explaining the two ways a team's
 * API can land in the OneAdmin catalog: standard-based automatic discovery via the
 * Standalone Gateway (target / coming later) and manual registration via the Sources
 * tab (MVP, available now). Plus the required / recommended OpenAPI metadata and
 * operation-level best practices.
 *
 * This replaces the old "Import Standards" tab — keeping standards out of the main
 * tab level so API Catalog feels focused on browsing, source management, and tool
 * configuration. Reachable from both the page header and the Sources tab.
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Extension {
  name: string;
  required: 'required' | 'recommended';
  description: string;
  example: string;
}

const EXTENSIONS: Extension[] = [
  { name: 'x-st-product',     required: 'required',    description: 'Identifies the parent product this API belongs to.',                                            example: 'marketing' },
  { name: 'x-st-module',      required: 'required',    description: 'Identifies the module / capability group within the product.',                                  example: 'campaigns' },
  { name: 'x-st-owner-team',  required: 'required',    description: 'Team that owns the API surface. Surfaced in the registry and audit feed.',                      example: 'Marketing Platform Team' },
  { name: 'x-st-stability',   required: 'required',    description: 'Lifecycle hint: stable | beta | deprecated | internal.',                                        example: 'stable' },
  { name: 'x-st-pii',         required: 'recommended', description: 'Set to true when the operation may return PII. Drives default redact-at-retrieval policy.',     example: 'true' },
  { name: 'x-st-rate-limit',  required: 'recommended', description: 'Rate-limit tier: low | medium | high. Seeds the per-tool rate limit on the AI Gateway.',        example: 'medium' },
  { name: 'x-st-permissions', required: 'recommended', description: 'List of platform roles that may call this operation. Read into Tool Configuration permissions.', example: '["marketing.analyst"]' },
];

const OPERATION_BEST_PRACTICES = [
  { title: 'operationId',                body: 'Should be stable and descriptive — it becomes the basis for the auto-generated tool name (snake_case).' },
  { title: 'summary',                    body: 'One short, plain-English sentence. The LLM sees this when deciding whether to call the tool.' },
  { title: 'description',                body: 'Explain the business meaning, not the wire shape. Include when to use the operation vs. its neighbours.' },
  { title: 'request / response schemas', body: 'Complete schemas with examples. The Tool Runtime uses examples to seed Playground parameters and to generate sample tool calls.' },
  { title: 'permissions',                body: 'Prefer attaching x-st-permissions at the operation level (not just at the source level) so write operations can be gated independently of read ones.' },
];

export default function ApiStandardsDrawer({ open, onClose }: Props) {
  // ESC closes the drawer.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <div
      aria-hidden={!open}
      className={clsx(
        'fixed inset-0 z-30 transition-opacity duration-200',
        open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />

      <aside
        className={clsx(
          'absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col bg-white shadow-xl transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        role="dialog"
        aria-label="API Standards"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-brand-50 p-2 text-brand-700">
              <BookOpen size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">API Standards</h2>
              <p className="mt-0.5 text-xs text-slate-500">How teams make APIs available for AI tools.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close API Standards"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-8">
            <div className="rounded-md border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-brand-900">
              <div className="flex items-start gap-2">
                <Info size={14} className="mt-0.5 shrink-0 text-brand-700" />
                <span>
                  Both paths end in the same place — endpoints appear under{' '}
                  <strong>API Catalog → Endpoints</strong> and become candidate tools. The standard path is the
                  long-term direction; manual registration is the MVP escape hatch.
                </span>
              </div>
            </div>

            <section>
              <SectionTitle title="Onboarding paths" />
              <div className="mt-3 space-y-3">
                <PathCard
                  number={1}
                  Icon={Compass}
                  title="Recommended · Automatic discovery"
                  subtitle="Long-term direction · coming later"
                  tone="brand"
                  badge={<Badge tone="brand">recommended</Badge>}
                  steps={[
                    'Team exposes a valid OpenAPI 3.x document.',
                    'Team adds the required metadata extensions (x-st-product, x-st-module, …).',
                    'Standalone Gateway discovers the service from its registry.',
                    'API Catalog imports the source automatically.',
                    'Endpoints become available for Tool Configuration, Playground, and Publish.',
                  ]}
                />
                <PathCard
                  number={2}
                  Icon={FileJson2}
                  title="Fallback · Manual registration"
                  subtitle="MVP path · available today"
                  tone="neutral"
                  badge={<Badge tone="success">available now</Badge>}
                  steps={[
                    'Team manually registers Product, Module, Base URL, and OpenAPI URL on the Sources tab.',
                    'API Catalog imports endpoints from that source.',
                    'Useful for MVP, local testing, dev environments, and services that do not yet follow the standard.',
                  ]}
                />
              </div>
            </section>

            <section>
              <SectionTitle
                title="Required + recommended metadata"
                description="Extensions live alongside operations and document-level metadata. Required ones gate discovery; recommended ones improve auto-generated defaults and governance posture."
              />
              <div className="mt-3 card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-2 text-left font-medium">Extension</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-left font-medium">Description</th>
                      <th className="px-4 py-2 text-left font-medium">Example</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {EXTENSIONS.map(e => (
                      <tr key={e.name}>
                        <td className="px-4 py-2 align-top font-mono text-xs text-slate-800">{e.name}</td>
                        <td className="px-4 py-2 align-top">
                          {e.required === 'required'
                            ? <Badge tone="warning">required</Badge>
                            : <Badge tone="info">recommended</Badge>}
                        </td>
                        <td className="px-4 py-2 align-top text-xs text-slate-600">{e.description}</td>
                        <td className="px-4 py-2 align-top font-mono text-[11px] text-slate-700">{e.example}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <SectionTitle title="Operation-level best practices" description="What every endpoint should carry, beyond the x-st-* metadata above." />
              <ul className="mt-3 space-y-2">
                {OPERATION_BEST_PRACTICES.map(p => (
                  <li key={p.title} className="card flex items-start gap-3 p-3">
                    <div className="rounded-md bg-brand-50 p-1.5 text-brand-600">
                      <CheckCircle2 size={14} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-900">{p.title}</div>
                      <p className="mt-0.5 text-xs text-slate-600">{p.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="grid gap-3 md:grid-cols-2">
              <div className="card p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <Sparkles size={12} /> Why these matter
                </div>
                <ul className="mt-3 space-y-2 text-xs text-slate-600">
                  <li><strong>Routing.</strong> Atlas knows assistant ids; the AI Gateway resolves agents, tools, and policies. Without product/module metadata it can't map a tool to the right runtime.</li>
                  <li><strong>Tool naming.</strong> Auto-generated tool names start from <span className="font-mono">operationId</span> — keep it stable so versions don't churn.</li>
                  <li><strong>Governance defaults.</strong> <span className="font-mono">x-st-pii</span> seeds redact-at-retrieval; <span className="font-mono">x-st-rate-limit</span> seeds the per-tool rate cap.</li>
                  <li><strong>Audit.</strong> Owner team appears on every execution trace so on-call can route fast.</li>
                </ul>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <ListChecks size={12} /> Ready to onboard?
                </div>
                <ol className="mt-3 space-y-2 text-xs text-slate-600">
                  <li className="flex items-start gap-2"><Server size={14} className="mt-0.5 text-slate-400" /> Make sure your standalone application exposes a JSON OpenAPI 3.x document.</li>
                  <li className="flex items-start gap-2"><Wrench size={14} className="mt-0.5 text-slate-400" /> Add the required x-st-* extensions on operations.</li>
                  <li className="flex items-start gap-2"><FileJson2 size={14} className="mt-0.5 text-slate-400" /> Register the source manually on the <strong>Sources</strong> tab.</li>
                </ol>
              </div>
            </section>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-3">
          <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
        </footer>
      </aside>
    </div>
  );
}

interface PathCardProps {
  number: number;
  Icon: typeof Compass;
  title: string;
  subtitle: string;
  tone: 'brand' | 'neutral';
  badge: React.ReactNode;
  steps: string[];
}

function PathCard({ number, Icon, title, subtitle, tone, badge, steps }: PathCardProps) {
  return (
    <article className="card flex flex-col p-4">
      <header className="flex items-start gap-3">
        <div className={tone === 'brand' ? 'rounded-md bg-brand-50 p-2 text-brand-700' : 'rounded-md bg-slate-100 p-2 text-slate-700'}>
          <Icon size={16} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Path {number}</span>
            {badge}
          </div>
          <h3 className="mt-0.5 text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </header>

      <ol className="mt-3 space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-xs text-slate-700">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-700">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </article>
  );
}
