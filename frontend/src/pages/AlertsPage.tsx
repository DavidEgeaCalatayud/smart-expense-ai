import { AlertTriangle, BellRing, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyStateCard } from '../components/ui/EmptyStateCard';

const plannedFeatures = [
  {
    icon: BellRing,
    title: 'Rule and anomaly alerts',
    description: 'Surface suspicious or unusual movements only after a real detection service is implemented.',
  },
  {
    icon: AlertTriangle,
    title: 'Duplicate charge review',
    description: 'Link possible duplicated payments to the persisted transactions that triggered the alert.',
  },
  {
    icon: CheckCircle2,
    title: 'Review workflow',
    description: 'Let users resolve, dismiss and audit alerts instead of displaying static warning counts.',
  },
];

export function AlertsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Planned monitoring"
        title="Alerts"
        description="Automated alerts will be enabled when detection rules and review persistence are implemented."
      />

      <section className="grid gap-5 md:grid-cols-3">
        {plannedFeatures.map((feature) => (
          <article key={feature.title} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <feature.icon size={20} />
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Planned</span>
            </div>
            <h2 className="font-bold text-slate-950">{feature.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{feature.description}</p>
          </article>
        ))}
      </section>

      <div className="mt-6">
        <EmptyStateCard
          icon={<AlertTriangle size={22} />}
          title="No automated alert engine is active yet"
          description="Transactions can currently be flagged for simple rule-based review, but anomaly and duplicate-charge detection are not presented as implemented features."
        />
      </div>
    </>
  );
}
