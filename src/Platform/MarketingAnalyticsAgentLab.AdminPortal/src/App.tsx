import { NavLink, Route, Routes } from 'react-router-dom';
import { Activity, Bot, Cog, ExternalLink, FlaskConical, Gauge, Sparkles, UploadCloud, Users, Wrench } from 'lucide-react';
import ApisPage from './pages/ApisPage';
import ApiDetailPage from './pages/ApiDetailPage';
import PluginsPage from './pages/PluginsPage';
import PluginDetailPage from './pages/PluginDetailPage';
import AgentsPage from './pages/AgentsPage';
import AssistantsPage from './pages/AssistantsPage';
import ActivityPage from './pages/ActivityPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import { platformUrls } from './lib/platform';

// Nav uses the new terminology: "Tools" in the sidebar points at the Tool Sets list
// (one Tool Set = an OpenAPI-derived group of callable AI tools). The legacy /plugins
// routes are kept so existing bookmarks and persisted links keep working.
//
// "Dashboard" is the AI Runtime Dashboard: usage / cost / reliability / governance
// rolled up from execution events. It's the new default landing route.
const nav = [
  { to: '/dashboard',  label: 'Dashboard',  icon: Gauge },
  { to: '/apis',       label: 'APIs',       icon: UploadCloud },
  { to: '/tools',      label: 'Tools',      icon: Wrench },
  { to: '/agents',     label: 'Agents',     icon: Bot },
  { to: '/assistants', label: 'Assistants', icon: Users },
  { to: '/activity',   label: 'Activity',   icon: Activity },
  { to: '/settings',   label: 'Settings',   icon: Cog },
];

export default function App() {
  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            <Sparkles size={14} /> Marketing Analytics Agent Lab
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-900">Admin Portal</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
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
        <div className="space-y-2 border-t border-slate-200 px-3 py-3 text-xs">
          <a
            href={platformUrls.devUi()}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50"
          >
            <span className="flex items-center gap-2">
              <FlaskConical size={14} className="text-brand-600" />
              <span className="font-medium">Open DevUI</span>
            </span>
            <ExternalLink size={12} className="text-slate-400" />
          </a>
          <div className="px-2 text-[11px] text-slate-500">
            .NET 10 · Aspire 13 · Agent Framework 1.6 · MCP 1.3
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/"             element={<DashboardPage />} />
          <Route path="/dashboard"    element={<DashboardPage />} />
          <Route path="/apis"         element={<ApisPage />} />
          <Route path="/apis/:id"     element={<ApiDetailPage />} />
          <Route path="/tools"        element={<PluginsPage />} />
          <Route path="/tools/:id"    element={<PluginDetailPage />} />
          <Route path="/plugins"      element={<PluginsPage />} />
          <Route path="/plugins/:id"  element={<PluginDetailPage />} />
          <Route path="/agents"       element={<AgentsPage />} />
          <Route path="/assistants"   element={<AssistantsPage />} />
          <Route path="/activity"     element={<ActivityPage />} />
          <Route path="/settings"     element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
