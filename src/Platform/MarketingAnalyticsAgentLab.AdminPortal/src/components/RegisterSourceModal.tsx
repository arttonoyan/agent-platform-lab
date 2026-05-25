import { useEffect, useMemo, useState } from 'react';
import { Cable, X } from 'lucide-react';
import { api, platformUrls, type ApiSpecDefinition } from '../lib/platform';
import { SERVICE_CATALOG } from '../lib/catalog';

interface Props {
  open: boolean;
  onClose: () => void;
  onRegistered: (spec: ApiSpecDefinition) => void;
}

interface InternalCandidate {
  serviceName: string;
  display: string;
  baseUrl: string;
  product: string;
  module: string;
}

/**
 * Builds the list of "well-known internal Marketing APIs" available through Aspire
 * service discovery. Anything not yet resolved by Aspire (e.g. the service is stopped)
 * is still surfaced so the operator can see why their quick-pick is missing - clicking
 * a disabled row falls back to the manual URL form.
 */
function useInternalCandidates(): InternalCandidate[] {
  return useMemo(
    () =>
      [
        { serviceName: 'analytics-api',    display: 'Marketing Analytics API',  baseUrl: platformUrls.analyticsApi() },
        { serviceName: 'campaigns-api',    display: 'Campaign Management API',  baseUrl: platformUrls.campaignsApi() },
        { serviceName: 'customers-api',    display: 'Customer Insights API',    baseUrl: platformUrls.customersApi() },
        { serviceName: 'notification-api', display: 'Notification API',         baseUrl: platformUrls.notificationApi() },
      ].map(c => {
        const meta = SERVICE_CATALOG[c.serviceName];
        return {
          ...c,
          product: meta?.productDisplay ?? 'Marketing',
          module: meta?.moduleDisplay ?? c.display,
        };
      }),
    [],
  );
}

/**
 * Modal used for the "Register Source" CTA on the API Catalog. Two paths:
 *
 *   1. Quick-pick from the well-known internal Marketing APIs - one click registers
 *      the source via Aspire's resolved base URL + the conventional `/openapi/v1.json`.
 *   2. Manual entry - paste any OpenAPI 3.x URL (with optional display-name override).
 *
 * Both paths hit the same `POST /apis/import` endpoint on the PluginRegistry, so the
 * registered source ends up in exactly the same shape regardless of how it got there.
 */
export default function RegisterSourceModal({ open, onClose, onRegistered }: Props) {
  const candidates = useInternalCandidates();
  const [serviceName, setServiceName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [openApiUrl, setOpenApiUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setServiceName('');
      setDisplayName('');
      setOpenApiUrl('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const canSubmit =
    !submitting && serviceName.trim().length > 0 && displayName.trim().length > 0 && openApiUrl.trim().length > 0;

  function chooseInternal(c: InternalCandidate) {
    if (!c.baseUrl) return;
    setServiceName(c.serviceName);
    setDisplayName(c.display);
    setOpenApiUrl(`${c.baseUrl}/openapi/v1.json`);
    setError(null);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const spec = await api.importApiSpec({
        serviceName: serviceName.trim(),
        displayName: displayName.trim(),
        openApiUrl: openApiUrl.trim(),
      });
      onRegistered(spec);
      onClose();
    } catch (ex) {
      setError((ex as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-6">
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-auto">
        <div className="card-header flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Cable size={14} className="text-brand-600" /> Register OpenAPI source
          </span>
          <button className="text-slate-400 hover:text-slate-700" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <p className="text-xs text-slate-600">
            The platform fetches the document, persists it in the registry, and indexes its
            operations into the catalog. Re-registering the same source updates the existing row.
          </p>

          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Internal Marketing APIs
            </div>
            <p className="mb-2 text-xs text-slate-500">
              One-click register using the URL Aspire service discovery resolved.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {candidates.map(c => (
                <button
                  key={c.serviceName}
                  type="button"
                  className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 text-left text-sm shadow-sm transition hover:border-brand-300 hover:bg-brand-50/40 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => chooseInternal(c)}
                  disabled={!c.baseUrl}
                  title={c.baseUrl || 'Service not resolved by Aspire'}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">{c.display}</span>
                    <span className="pill bg-slate-100 text-slate-600">{c.product} / {c.module}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 truncate">
                    {c.baseUrl || '(not resolved)'}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Source details
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Service name
                <input
                  className="input mt-1 font-mono"
                  value={serviceName}
                  onChange={e => setServiceName(e.target.value)}
                  placeholder="analytics-api"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Display name
                <input
                  className="input mt-1"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Marketing Analytics API"
                />
              </label>
              <label className="col-span-2 block text-xs font-medium text-slate-600">
                OpenAPI document URL
                <input
                  className="input mt-1 font-mono"
                  value={openApiUrl}
                  onChange={e => setOpenApiUrl(e.target.value)}
                  placeholder="https://service.internal/openapi/v1.json"
                />
              </label>
            </div>
            {error && (
              <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
                {error}
              </p>
            )}
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={submit} disabled={!canSubmit}>
            <Cable size={14} /> {submitting ? 'Registering...' : 'Register source'}
          </button>
        </div>
      </div>
    </div>
  );
}
