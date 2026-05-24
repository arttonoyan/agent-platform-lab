import { Navigate, Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import DashboardPage from './pages/dashboard/DashboardPage';
import ApiCatalogPage from './pages/api-catalog/ApiCatalogPage';
import EndpointsTab from './pages/api-catalog/tabs/EndpointsTab';
import EndpointDetailPage from './pages/api-catalog/EndpointDetailPage';
import SourcesTab from './pages/api-catalog/tabs/SourcesTab';
import AgentsPage from './pages/agents/AgentsPage';
import AgentDetailPage from './pages/agents/AgentDetailPage';
import KnowledgeSourcesPage from './pages/knowledge/KnowledgeSourcesPage';
import KnowledgeSourceDetailPage from './pages/knowledge/KnowledgeSourceDetailPage';
import ToolAgentRegistryPage from './pages/registry/ToolAgentRegistryPage';
import AiGatewayPage from './pages/gateway/AiGatewayPage';
import ExecutionsAuditPage from './pages/executions/ExecutionsAuditPage';
import ExecutionDetailPage from './pages/executions/ExecutionDetailPage';

export default function App() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-slate-50">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Back-compat: the standalone OpenAPI Sources page is now the Sources tab. */}
          <Route path="/openapi-sources" element={<Navigate to="/api-catalog/sources" replace />} />

          <Route path="/api-catalog" element={<ApiCatalogPage />}>
            <Route index element={<Navigate to="endpoints" replace />} />
            <Route path="endpoints" element={<EndpointsTab />}>
              <Route path=":endpointId" element={<EndpointDetailPage />} />
            </Route>
            <Route path="sources" element={<SourcesTab />} />
            {/* Back-compat: the old Import Standards tab is now a right-side drawer.
                Redirecting with ?standards=1 auto-opens the drawer on load. */}
            <Route path="standards" element={<Navigate to="/api-catalog/endpoints?standards=1" replace />} />
          </Route>

          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/:agentId" element={<AgentDetailPage />} />

          <Route path="/knowledge" element={<KnowledgeSourcesPage />} />
          <Route path="/knowledge/:knowledgeId" element={<KnowledgeSourceDetailPage />} />

          <Route path="/registry" element={<ToolAgentRegistryPage />} />

          <Route path="/gateway" element={<AiGatewayPage />} />

          <Route path="/executions" element={<ExecutionsAuditPage />} />
          <Route path="/executions/:executionId" element={<ExecutionDetailPage />} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
