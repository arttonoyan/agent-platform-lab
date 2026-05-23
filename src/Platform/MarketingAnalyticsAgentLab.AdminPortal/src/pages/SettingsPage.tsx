import { ExternalLink } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { platformUrls } from '../lib/platform';

const links = [
  { label: 'AI Assistant Gateway',    url: () => platformUrls.aiGateway(),       hint: 'POST /assistant/api/interaction/message' },
  { label: 'Agent Runtime',           url: () => platformUrls.agentRuntime(),    hint: 'Hosts AIAgent instances' },
  { label: 'DevUI (in-process)',      url: () => platformUrls.devUi(),           hint: 'Workflow + trace debugging - served by AgentRuntime' },
  { label: 'MCP Server',              url: () => platformUrls.mcpServer(),       hint: 'Dynamic plugin -> MCP tool host' },
  { label: 'Plugin Registry',         url: () => platformUrls.pluginRegistry(),  hint: 'Plugin / agent / assistant CRUD + events' },
  { label: 'Marketing Analytics API', url: () => platformUrls.analyticsApi(),    hint: 'Standalone-app API' },
  { label: 'Campaign Management API', url: () => platformUrls.campaignsApi(),    hint: 'Standalone-app API' },
  { label: 'Customer Insights API',   url: () => platformUrls.customersApi(),    hint: 'Standalone-app API' },
  { label: 'Notification API',        url: () => platformUrls.notificationApi(), hint: 'Standalone-app API' },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Resolved service URLs (via Aspire service discovery)." />
      <div className="grid gap-3 p-8 md:grid-cols-2">
        {links.map(l => {
          const url = l.url();
          return (
            <a key={l.label} className="card flex items-center justify-between px-5 py-3 hover:bg-slate-50"
               href={url || '#'} target="_blank" rel="noreferrer">
              <div>
                <div className="text-sm font-medium text-slate-900">{l.label}</div>
                <div className="text-xs text-slate-500">{l.hint}</div>
                <div className="font-mono text-xs text-slate-400">{url || '(not running)'}</div>
              </div>
              <ExternalLink size={14} className="text-slate-400" />
            </a>
          );
        })}
      </div>
    </>
  );
}
