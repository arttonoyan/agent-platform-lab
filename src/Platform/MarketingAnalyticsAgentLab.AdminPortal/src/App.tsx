import { NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Activity, Bot, Cog, ExternalLink, FlaskConical, Gauge, Sparkles, Users, Wrench } from 'lucide-react';
import ToolsPage from './pages/ToolsPage';
import ApiDetailPage from './pages/ApiDetailPage';
import EndpointDetailPage from './pages/EndpointDetailPage';
import PluginDetailPage from './pages/PluginDetailPage';
import AgentsPage from './pages/AgentsPage';
import AssistantsPage from './pages/AssistantsPage';
import ActivityPage from './pages/ActivityPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import { platformUrls } from './lib/platform';

// New IA: "Tools" merges the old "API Catalog" + "Tools" sections into one workspace
// that owns the full lifecycle from OpenAPI source → endpoints → Tool Sets. The
// previous "API Catalog" top-level entry is gone. Agents only attach published Tool
// Sets; Assistants front Atlas; Activity shows runtime events.
const nav = [
  { to: '/dashboard',  label: 'Dashboard',  icon: Gauge },
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
          <Route path="/"          element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Unified Tools workspace */}
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/tools/tool-sets/:id" element={<PluginDetailPage />} />
          <Route path="/tools/sources/:id" element={<ApiDetailPage />} />
          <Route path="/tools/sources/:id/endpoints/:operationId" element={<EndpointDetailPage />} />

          {/* Legacy redirects so persisted bookmarks and copy/pasted links keep working
              after the IA refactor that retired "API Catalog" as a top-level section. */}
          <Route path="/apis" element={<Navigate to="/tools?tab=sources" replace />} />
          <Route path="/apis/:id" element={<LegacyApiRedirect />} />
          <Route path="/apis/:id/endpoints/:operationId" element={<LegacyEndpointRedirect />} />
          <Route path="/plugins" element={<Navigate to="/tools" replace />} />
          <Route path="/plugins/:id" element={<LegacyPluginRedirect />} />

          {/* Same old Tool Set detail at /tools/:id for the briefest period before
              users learn the new nested URL — accepted because the new IA spec wants
              everything under /tools/tool-sets/<id>. */}

          <Route path="/agents"     element={<AgentsPage />} />
          <Route path="/assistants" element={<AssistantsPage />} />
          <Route path="/activity"   element={<ActivityPage />} />
          <Route path="/settings"   element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

// Tiny legacy redirect helpers. Kept inline because they exist only to keep old
// bookmarks alive — they should disappear once the next major release decides the
// legacy URL grace period is over.

function LegacyApiRedirect() {
  const { id = '' } = useParams();
  return <Navigate to={`/tools/sources/${id}`} replace />;
}

function LegacyEndpointRedirect() {
  const { id = '', operationId = '' } = useParams();
  return <Navigate to={`/tools/sources/${id}/endpoints/${operationId}`} replace />;
}

function LegacyPluginRedirect() {
  const { id = '' } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/tools/tool-sets/${id}${search}`} replace />;
}
