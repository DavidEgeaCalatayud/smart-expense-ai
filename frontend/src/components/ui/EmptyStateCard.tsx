import type { ReactNode } from 'react';

interface EmptyStateCardProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export function EmptyStateCard({ icon, title, description }: EmptyStateCardProps) {
  return (
    <article className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-soft">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
        {icon}
      </div>
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
    </article>
  );
}
