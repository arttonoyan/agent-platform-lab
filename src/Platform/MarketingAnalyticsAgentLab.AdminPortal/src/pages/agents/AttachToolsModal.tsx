import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, FileJson2, Filter, Lock, Search, ShieldAlert, Wrench, X } from 'lucide-react';
import clsx from 'clsx';
import Badge from '../../components/Badge';
import { ToolStatusBadge, WriteSafetyBadge } from '../../components/StatusBadge';
import { catalogApi, openApiSourcesApi, toolsApi } from '../../services/api';
import type { Endpoint, RegistryTool, ToolStatus, WriteSafety } from '../../data/types';

interface Props {
  alreadyAttachedIds: string[];
  onCancel: () => void;
  /** Receives the FULL desired tool id set (existing + new), so the modal can act as a multi-attach picker. */
  onAttach: (selectedIds: string[]) => void;
}

type StatusFilter = ToolStatus | 'All';
type SafetyFilter = WriteSafety | 'All';
type PermissionFilter = 'all' | 'no-approval' | 'requires-approval';

const STATUS_FILTERS: StatusFilter[] = ['All', 'Published', 'InReview', 'Draft', 'Deprecated'];
const SAFETY_FILTERS: SafetyFilter[] = ['All', 'read', 'write', 'destructive'];

/**
 * Tool picker used by the Agent Tools tab.
 *
 * Lists every entry in the Tool & Agent Registry. Only `Published` tools can actually be
 * attached — `Draft` / `InReview` / `Deprecated` rows are visible (so the operator
 * understands what's in the pipeline) but disabled with a clear reason.
 *
 * Filters mirror what's on the user spec: Product, Module, Status, Read-only / Write,
 * Permission. Sample tools are shown with a "Sample" tag so it's obvious which rows
 * aren't backed by a real OpenAPI source yet.
 */
export default function AttachToolsModal({ alreadyAttachedIds, onCancel, onAttach }: Props) {
  const tools = useQuery({ queryKey: ['tools'], queryFn: () => toolsApi.listRegistryTools() });
  const endpoints = useQuery({ queryKey: ['endpoints'], queryFn: () => catalogApi.listEndpoints() });
  const products = useQuery({ queryKey: ['products'], queryFn: () => catalogApi.listProducts() });
  const sources = useQuery({ queryKey: ['openapi.sources'], queryFn: () => openApiSourcesApi.list() });

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Published');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [safetyFilter, setSafetyFilter] = useState<SafetyFilter>('All');
  const [permissionFilter, setPermissionFilter] = useState<PermissionFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(alreadyAttachedIds));

  const endpointById = useMemo(
    () => new Map<string, Endpoint>((endpoints.data ?? []).map(e => [e.id, e])),
    [endpoints.data],
  );

  const productOptions = useMemo(() => {
    const ids = new Set((tools.data ?? []).map(t => t.productId));
    return [
      { id: 'all', label: 'All products' },
      ...Array.from(ids)
        .map(id => ({
          id,
          label: products.data?.find(p => p.id === id)?.displayName ?? id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [tools.data, products.data]);

  const moduleOptions = useMemo(() => {
    const filteredTools = productFilter === 'all'
      ? (tools.data ?? [])
      : (tools.data ?? []).filter(t => t.productId === productFilter);
    const ids = Array.from(new Set(filteredTools.map(t => t.moduleId))).sort();
    return [{ id: 'all', label: 'All modules' }, ...ids.map(id => ({ id, label: id.split('.').slice(1).join('.') || id }))];
  }, [tools.data, productFilter]);

  const filteredTools = useMemo(() => {
    let rows = tools.data ?? [];
    if (statusFilter !== 'All') rows = rows.filter(t => t.status === statusFilter);
    if (productFilter !== 'all') rows = rows.filter(t => t.productId === productFilter);
    if (moduleFilter !== 'all') rows = rows.filter(t => t.moduleId === moduleFilter);
    if (safetyFilter !== 'All') {
      rows = rows.filter(t => endpointById.get(t.endpointId)?.writeSafety === safetyFilter);
    }
    if (permissionFilter === 'requires-approval') {
      rows = rows.filter(t => t.configuration.permissions.requiresApproval);
    } else if (permissionFilter === 'no-approval') {
      rows = rows.filter(t => !t.configuration.permissions.requiresApproval);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(t =>
        t.toolName.toLowerCase().includes(q) ||
        t.configuration.toolDescription.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [tools.data, statusFilter, productFilter, moduleFilter, safetyFilter, permissionFilter, query, endpointById]);

  const toggle = (tool: RegistryTool) => {
    if (!isAttachable(tool)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tool.id)) next.delete(tool.id);
      else next.add(tool.id);
      return next;
    });
  };

  const addedCount = useMemo(
    () => Array.from(selected).filter(id => !alreadyAttachedIds.includes(id)).length,
    [selected, alreadyAttachedIds],
  );
  const removedCount = useMemo(
    () => alreadyAttachedIds.filter(id => !selected.has(id)).length,
    [selected, alreadyAttachedIds],
  );

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-6">
      <div className="card flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden">
        <div className="card-header flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Attach tools</div>
            <div className="text-xs font-normal text-slate-500">
              Choose tools from the registry. Only <strong>Published</strong> tools can be attached.
            </div>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        {/* Filters */}
        <div className="border-b border-slate-200 px-5 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-7"
                placeholder="Search tool name or description…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <label className="label">
              Product
              <select className="input mt-1" value={productFilter} onChange={e => { setProductFilter(e.target.value); setModuleFilter('all'); }}>
                {productOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="label">
              Module
              <select className="input mt-1" value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}>
                {moduleOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="label">
              Type
              <select className="input mt-1" value={safetyFilter} onChange={e => setSafetyFilter(e.target.value as SafetyFilter)}>
                {SAFETY_FILTERS.map(s => <option key={s} value={s}>{s === 'All' ? 'All types' : s}</option>)}
              </select>
            </label>
            <label className="label">
              Permission
              <select className="input mt-1" value={permissionFilter} onChange={e => setPermissionFilter(e.target.value as PermissionFilter)}>
                <option value="all">All</option>
                <option value="no-approval">No approval required</option>
                <option value="requires-approval">Requires approval</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-slate-500"><Filter size={11} className="inline" /> Status</span>
            {STATUS_FILTERS.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={clsx('pill', statusFilter === s ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {filteredTools.length === 0 ? (
            <p className="p-12 text-center text-sm text-slate-500">No tools match the current filters.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filteredTools.map(t => {
                const ep = endpointById.get(t.endpointId);
                const attachable = isAttachable(t);
                const isSelected = selected.has(t.id);
                const sourceLabel = ep?.sourceId
                  ? sources.data?.find(s => s.id === ep.sourceId)?.displayName ?? ep.sourceId
                  : 'sample data (no OpenAPI source)';

                return (
                  <li
                    key={t.id}
                    className={clsx(
                      'flex items-start gap-3 px-5 py-3',
                      isSelected && 'bg-brand-50/40',
                      !attachable && 'opacity-80',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 disabled:cursor-not-allowed"
                      checked={isSelected}
                      disabled={!attachable}
                      onChange={() => toggle(t)}
                    />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Wrench size={13} className="text-brand-600" />
                        <Link
                          to={`/api-catalog/${t.endpointId}`}
                          className="font-mono font-medium text-slate-900 hover:text-brand-700"
                          onClick={e => e.stopPropagation()}
                        >
                          {t.toolName}
                        </Link>
                        <ToolStatusBadge status={t.status} />
                        {t.isSeed && <Badge tone="warning">Sample</Badge>}
                        {!t.isSeed && <Badge tone="info">Real</Badge>}
                        <span className="text-[10px] text-slate-500">v{t.version}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">{t.configuration.toolDescription}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        {ep && (
                          <span className="inline-flex items-center gap-1 font-mono">
                            <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-semibold">{ep.method}</span>
                            <span className="text-slate-700">{ep.path}</span>
                          </span>
                        )}
                        {ep && <WriteSafetyBadge writeSafety={ep.writeSafety} />}
                        <span className="inline-flex items-center gap-1">
                          <FileJson2 size={11} /> {sourceLabel}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {t.configuration.permissions.allowedRoles.length === 0 && (
                          <span className="text-[11px] text-slate-400">no role gating</span>
                        )}
                        {t.configuration.permissions.allowedRoles.map(role => (
                          <Badge key={role} tone="neutral" mono><Lock size={10} /> {role}</Badge>
                        ))}
                        {t.configuration.permissions.requiresApproval && (
                          <Badge tone="warning">requires approval</Badge>
                        )}
                      </div>
                      {!attachable && (
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                          <ShieldAlert size={11} /> {disabledReason(t)}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs">
          <div className="text-slate-500">
            <span className="text-slate-700">{selected.size}</span> selected
            {addedCount > 0 && <> · <span className="text-emerald-700">+{addedCount} new</span></>}
            {removedCount > 0 && <> · <span className="text-rose-700">-{removedCount} removed</span></>}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-ghost" onClick={onCancel}>Cancel</button>
            <button className="btn" onClick={() => onAttach(Array.from(selected))}>
              <Check size={14} /> Apply selection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function isAttachable(t: RegistryTool): boolean {
  return t.status === 'Published';
}

function disabledReason(t: RegistryTool): string {
  switch (t.status) {
    case 'Draft':      return 'Draft tools must be published before they can be attached.';
    case 'InReview':   return 'In-review tools must complete review and publish before they can be attached.';
    case 'Deprecated': return 'Deprecated tools cannot be attached. Pick a current alternative.';
    default:           return 'This tool is not currently attachable.';
  }
}
