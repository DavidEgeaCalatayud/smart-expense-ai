import type { Alert } from '../../types/dashboard';
import { Badge } from '../ui/Badge';

interface AlertsPanelProps {
  alerts: Alert[];
}

const severityTone = {
  low: 'blue',
  medium: 'amber',
  high: 'red',
} as const;

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="mb-5">
        <h2 className="text-lg font-bold">AI alerts</h2>
        <p className="text-sm text-slate-500">Automatic anomaly detection</p>
      </div>

      <div className="space-y-4">
        {alerts.map((alert) => (
          <article key={alert.id} className="rounded-2xl border border-slate-200 p-4 transition hover:border-brand-100 hover:bg-slate-50">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold">{alert.title}</h3>
              <Badge tone={severityTone[alert.severity]}>{alert.severity}</Badge>
            </div>
            <p className="text-sm leading-6 text-slate-500">{alert.message}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
