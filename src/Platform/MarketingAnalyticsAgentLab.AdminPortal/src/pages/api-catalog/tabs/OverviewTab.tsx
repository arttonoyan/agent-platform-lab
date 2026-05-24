import { ArrowRight, Wrench } from 'lucide-react';
import JsonBlock from '../../../components/JsonBlock';
import Badge from '../../../components/Badge';
import { ToolStatusBadge } from '../../../components/StatusBadge';
import type { Endpoint, Module, Product, RegistryTool } from '../../../data/types';

interface Props {
  endpoint: Endpoint;
  product: Product;
  module: Module;
  tool: RegistryTool | undefined;
  hasConfiguration: boolean;
  onConfigureAsTool: () => void;
}

export default function OverviewTab({ endpoint, product, module, tool, hasConfiguration, onConfigureAsTool }: Props) {
  const ctaLabel = hasConfiguration ? 'Edit Tool Configuration' : 'Configure as Tool';
  const ctaHint = hasConfiguration
    ? 'A tool configuration already exists for this endpoint. Edit, test, and publish it.'
    : 'Create a draft ToolDefinition from this OpenAPI operation. Test it in the Playground, then publish.';

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="xl:col-span-2 space-y-6">
        <section className="card flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-brand-50 p-2 text-brand-600">
              <Wrench size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">{ctaLabel}</div>
              <p className="mt-0.5 text-xs text-slate-500">{ctaHint}</p>
            </div>
          </div>
          <button className="btn shrink-0" onClick={onConfigureAsTool}>
            {ctaLabel} <ArrowRight size={14} />
          </button>
        </section>

        <section className="card">
          <div className="card-header">Parameters</div>
          {endpoint.parameters.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-500">No parameters — this endpoint takes no input.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-4 py-2 text-left font-medium">In</th>
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-left font-medium">Required</th>
                  <th className="px-4 py-2 text-left font-medium">Example</th>
                  <th className="px-4 py-2 text-left font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {endpoint.parameters.map(p => (
                  <tr key={`${p.name}-${p.in}`} className="text-slate-800">
                    <td className="px-4 py-2 font-mono">{p.name}</td>
                    <td className="px-4 py-2"><Badge tone="neutral" mono>{p.in}</Badge></td>
                    <td className="px-4 py-2 font-mono text-xs">{p.type}</td>
                    <td className="px-4 py-2">{p.required ? <Badge tone="warning">required</Badge> : <span className="text-slate-400 text-xs">optional</span>}</td>
                    <td className="px-4 py-2 font-mono text-xs">{p.example != null ? String(p.example) : '—'}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <div className="card-header">Example response · {endpoint.responseStatus}</div>
          <div className="p-4">
            <JsonBlock value={endpoint.responseExample} maxHeight="20rem" />
          </div>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="card p-5">
          <div className="section-title">Provenance</div>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-start justify-between gap-2">
              <dt className="text-slate-500">Product</dt>
              <dd className="font-medium text-slate-800">{product.displayName}</dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="text-slate-500">Module</dt>
              <dd className="font-medium text-slate-800">{module.displayName}</dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="text-slate-500">Owner team</dt>
              <dd className="font-medium text-slate-800">{product.ownerTeam}</dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="text-slate-500">Gateway base</dt>
              <dd className="font-mono text-xs text-slate-700">{product.gatewayBaseUrl}</dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="text-slate-500">Operation id</dt>
              <dd className="font-mono text-xs text-slate-700">{endpoint.operationId}</dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="text-slate-500">Last updated</dt>
              <dd className="text-xs text-slate-700">{new Date(endpoint.lastUpdated).toLocaleString()}</dd>
            </div>
          </dl>
        </section>

        <section className="card p-5">
          <div className="section-title">x- extensions</div>
          <dl className="mt-3 space-y-1.5 text-xs">
            <div className="flex justify-between"><dt className="text-slate-500">x-st-product</dt>      <dd className="font-mono text-slate-800">{endpoint.xStMetadata.product}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">x-st-module</dt>       <dd className="font-mono text-slate-800">{endpoint.xStMetadata.module}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">x-st-stability</dt>    <dd className="font-mono text-slate-800">{endpoint.xStMetadata.stability}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">x-st-rate-limit</dt>   <dd className="font-mono text-slate-800">{endpoint.xStMetadata.rateLimitTier ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">x-st-pii</dt>          <dd className="font-mono text-slate-800">{endpoint.xStMetadata.pii ? 'true' : 'false'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">tags</dt>              <dd className="text-slate-800">{endpoint.tags.join(', ')}</dd></div>
          </dl>
        </section>

        <section className="card p-5">
          <div className="section-title">Tool status</div>
          {tool ? (
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <ToolStatusBadge status={tool.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tool name</span>
                <span className="font-mono text-slate-800">{tool.toolName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Version</span>
                <span className="font-mono text-slate-800">{tool.version}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Owner</span>
                <span className="text-slate-800">{tool.owner}</span>
              </div>
              {tool.publishedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Published</span>
                  <span className="text-xs text-slate-800">{new Date(tool.publishedAt).toLocaleString()}</span>
                </div>
              )}
              {tool.configuration.permissions.allowedAgents.length > 0 && (
                <div>
                  <div className="text-slate-500">Allowed agents</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {tool.configuration.permissions.allowedAgents.map(a => (
                      <Badge key={a} tone="brand" mono>{a}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : hasConfiguration ? (
            <p className="mt-3 text-sm text-slate-500">
              A draft tool configuration exists for this endpoint. Test it on the <strong>Playground</strong> tab and then promote it on the <strong>Publish</strong> tab.
            </p>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              No tool has been created from this endpoint yet. Click <strong>Configure as Tool</strong> above to start.
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}
