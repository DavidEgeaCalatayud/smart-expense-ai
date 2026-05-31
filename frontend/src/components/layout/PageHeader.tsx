import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-slate-500">{description}</p>
      </div>
      {action}
    </header>
  );
}
