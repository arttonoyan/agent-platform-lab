import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ListTree, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { api, platformUrls } from '../lib/platform';

const internalApis = [
  { service: 'analytics-api',    display: 'Marketing Analytics API',  url: () => platformUrls.analyticsApi() },
  { service: 'campaigns-api',    display: 'Campaign Management API',  url: () => platformUrls.campaignsApi() },
  { service: 'customers-api',    display: 'Customer Insights API',    url: () => platformUrls.customersApi() },
  { service: 'notification-api', display: 'Notification API',         url: () => platformUrls.notificationApi() },
];

export default function ApisPage() {
  const qc = useQueryClient();
  const apis = useQuery({ queryKey: ['apis'], queryFn: () => api.listApiSpecs() });
  const importMutation = useMutation({
    mutationFn: (vars: { service: string; display: string; baseUrl: string }) =>
      api.importApiSpec({ serviceName: vars.service, displayName: vars.display, openApiUrl: `${vars.baseUrl}/openapi/v1.json` }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apis'] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteApiSpec(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apis'] }),
  });
  const [importingService, setImportingService] = useState<string | null>(null);
  const importedServices = new Set((apis.data ?? []).map(s => s.serviceName));

  return (
    <>
      <PageHeader
        title="APIs"
        subtitle="Import OpenAPI specs from internal Marketing APIs. Then select operations and create a Tool Set: API \u2192 operations \u2192 Tool Set."
      />
      <div className="space-y-6 p-8">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Internal Marketing APIs</h2>
          <p className="mt-1 text-sm text-slate-500">Discoverable via Aspire service discovery. Click Import to fetch the OpenAPI document. Re-importing the same API updates the existing row.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {internalApis.map(a => {
              const baseUrl = a.url();
              const alreadyImported = importedServices.has(a.service);
              const isWorking = importMutation.isPending && importingService === a.service;
              return (
                <div key={a.service} className="card flex items-center justify-between px-5 py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{a.display}</span>
                      {alreadyImported && <span className="pill bg-emerald-100 text-emerald-800">imported</span>}
                    </div>
                    <div className="font-mono text-xs text-slate-500">{baseUrl || '(not resolved by Aspire)'}</div>
                  </div>
                  <button
                    className="btn-ghost"
                    disabled={!baseUrl || isWorking}
                    onClick={() => {
                      setImportingService(a.service);
                      importMutation.mutate({ service: a.service, display: a.display, baseUrl });
                    }}
                  >
                    <Download size={14} />
                    {isWorking ? 'Importing...' : (alreadyImported ? 'Re-import' : 'Import')}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Imported specs</h2>
          {apis.isPending && <p className="mt-2 text-sm text-slate-500">Loading...</p>}
          {apis.error && <p className="mt-2 text-sm text-rose-600">{(apis.error as Error).message}</p>}
          <div className="mt-3 space-y-2">
            {apis.data?.map(spec => (
              <div key={spec.id} className="card flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                <Link to={`/apis/${spec.id}`} className="flex-1">
                  <div className="text-sm font-medium text-slate-900">{spec.displayName}</div>
                  <div className="font-mono text-xs text-slate-500">{spec.baseAddress} · {spec.operationCount} operations</div>
                </Link>
                <div className="flex items-center gap-2">
                  <Link to={`/apis/${spec.id}`} className="text-slate-400 hover:text-slate-700" title="View operations">
                    <ListTree size={16} />
                  </Link>
                  <button
                    className="text-slate-400 hover:text-rose-600"
                    title="Delete spec"
                    disabled={deleteMutation.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      if (confirm(`Delete the imported spec "${spec.displayName}"?`)) {
                        deleteMutation.mutate(spec.id);
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {apis.data?.length === 0 && (
              <p className="text-sm text-slate-500">No specs imported yet. Use Import above to add one.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
