import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string;
  detail: string;
  trend: 'up' | 'down' | 'neutral' | 'warning';
  icon: ReactNode;
}

const trendClasses = {
  up: 'bg-amber-50 text-amber-700',
  down: 'bg-emerald-50 text-emerald-700',
  neutral: 'bg-slate-100 text-slate-700',
  warning: 'bg-red-50 text-red-700',
};

const trendIcons = {
  up: <ArrowUpRight size={14} />,
  down: <ArrowDownRight size={14} />,
  neutral: <Minus size={14} />,
  warning: <ArrowUpRight size={14} />,
};

export function MetricCard({ title, value, detail, trend, icon }: MetricCardProps) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          {icon}
        </div>
        <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${trendClasses[trend]}`}>
          {trendIcons[trend]}
          Live
        </span>
      </div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </article>
  );
}
