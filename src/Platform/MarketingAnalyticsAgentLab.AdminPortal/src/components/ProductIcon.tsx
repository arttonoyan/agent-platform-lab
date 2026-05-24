import { Boxes, Briefcase, Megaphone, Truck, Users, Wrench, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import type { Product } from '../data/types';

const iconMap: Record<string, LucideIcon> = {
  megaphone: Megaphone,
  truck:     Truck,
  wrench:    Wrench,
  users:     Users,
  briefcase: Briefcase,
  boxes:     Boxes,
};

const domainTone: Record<Product['domain'], string> = {
  marketing: 'bg-violet-100 text-violet-700',
  fleet:     'bg-sky-100 text-sky-700',
  fieldops:  'bg-emerald-100 text-emerald-700',
  hr:        'bg-amber-100 text-amber-700',
  finance:   'bg-rose-100 text-rose-700',
  platform:  'bg-slate-200 text-slate-700',
};

interface Props {
  product: Pick<Product, 'iconKey' | 'domain'>;
  size?: number;
  className?: string;
}

export default function ProductIcon({ product, size = 16, className }: Props) {
  const Icon = iconMap[product.iconKey] ?? Boxes;
  return (
    <span className={clsx('inline-flex items-center justify-center rounded-md p-1.5', domainTone[product.domain], className)}>
      <Icon size={size} />
    </span>
  );
}
