import clsx from 'clsx';
import type { HttpMethod } from '../data/types';

const tones: Record<HttpMethod, string> = {
  GET:    'bg-sky-100 text-sky-800',
  POST:   'bg-emerald-100 text-emerald-800',
  PUT:    'bg-amber-100 text-amber-800',
  PATCH:  'bg-violet-100 text-violet-800',
  DELETE: 'bg-rose-100 text-rose-800',
};

export default function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span className={clsx('inline-flex w-14 justify-center rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold', tones[method])}>
      {method}
    </span>
  );
}
