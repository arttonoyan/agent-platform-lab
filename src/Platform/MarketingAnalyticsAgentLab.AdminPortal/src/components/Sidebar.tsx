import { NavLink } from 'react-router-dom';
import {
  Activity,
  Boxes,
  Bot,
  Database,
  LayoutDashboard,
  Library,
  Network,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  hint: string;
}

const nav: NavItem[] = [
  { to: '/dashboard',        label: 'Dashboard',             Icon: LayoutDashboard, hint: 'Platform health, authoring loop, recent activity' },
  { to: '/api-catalog',      label: 'API Catalog',           Icon: Library,         hint: 'Browse APIs, manage OpenAPI sources, and onboarding standards' },
  { to: '/agents',           label: 'Agents',                Icon: Bot,             hint: 'Microsoft Agent Framework agents and workflows' },
  { to: '/knowledge',        label: 'Knowledge Sources',     Icon: Database,        hint: 'Vector collections (Qdrant / pgvector)' },
  { to: '/registry',         label: 'Tool & Agent Registry', Icon: Boxes,           hint: 'Every published tool and agent, with version + owner' },
  { to: '/gateway',          label: 'AI Gateway',            Icon: Network,         hint: 'Product-side runtime plane that Atlas routes into' },
  { to: '/executions',       label: 'Executions / Audit',    Icon: Activity,        hint: 'Execution traces, telemetry, governance' },
];

export default function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
          <Sparkles size={13} /> ServiceTitan
        </div>
        <div className="mt-1 text-base font-semibold text-slate-900">AI Tooling Platform</div>
        <div className="mt-0.5 text-[11px] text-slate-500">OneAdmin · internal</div>
      </div>

      <nav className="flex-1 space-y-0.5 p-2.5">
        {nav.map(({ to, label, Icon, hint }) => (
          <NavLink
            key={to}
            to={to}
            title={hint}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <Icon size={16} aria-hidden />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 px-3 py-3 text-[11px] text-slate-500">
        <div className="font-medium text-slate-700">Engine</div>
        <div className="mt-0.5">Microsoft Agent Framework</div>
        <div>Microsoft.Extensions.VectorData</div>
        <div className="mt-1.5 font-medium text-slate-700">Vector providers</div>
        <div className="mt-0.5">Qdrant (platform) · pgvector (per-product)</div>
      </div>
    </aside>
  );
}
