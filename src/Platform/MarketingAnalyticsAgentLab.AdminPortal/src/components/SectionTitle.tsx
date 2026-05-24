import type { ReactNode } from 'react';

interface Props {
  title: string;
  description?: string;
  right?: ReactNode;
}

export default function SectionTitle({ title, description, right }: Props) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <h2 className="section-title">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {right}
    </div>
  );
}
