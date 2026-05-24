import clsx from 'clsx';
import type { ReactNode } from 'react';

export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  brand:   'bg-brand-100 text-brand-700',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger:  'bg-rose-100 text-rose-800',
  info:    'bg-sky-100 text-sky-800',
  purple:  'bg-violet-100 text-violet-800',
};

interface Props {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
  mono?: boolean;
}

export default function Badge({ tone = 'neutral', className, children, mono }: Props) {
  return (
    <span className={clsx('pill', tones[tone], mono && 'font-mono', className)}>
      {children}
    </span>
  );
}
