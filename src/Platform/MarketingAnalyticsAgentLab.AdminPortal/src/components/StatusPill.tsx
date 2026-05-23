import clsx from 'clsx';
import type { PluginStatus } from '../lib/platform';

const styles: Record<PluginStatus, string> = {
  Draft:     'bg-slate-100 text-slate-700',
  Testing:   'bg-amber-100 text-amber-800',
  Published: 'bg-emerald-100 text-emerald-800',
  Disabled:  'bg-rose-100 text-rose-800',
};

export default function StatusPill({ status }: { status: PluginStatus }) {
  return <span className={clsx('pill', styles[status])}>{status}</span>;
}
