import { BrainCircuit, CalendarClock, LineChart, Repeat } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyStateCard } from '../components/ui/EmptyStateCard';

const plannedFeatures = [
  {
    icon: LineChart,
    title: 'Monthly spending forecast',
    description: 'Project end-of-month spending from persisted historical transactions.',
  },
  {
    icon: Repeat,
    title: 'Recurring charge projection',
    description: 'Estimate upcoming recurring payments from real recurring transaction patterns.',
  },
  {
    icon: CalendarClock,
    title: 'Explainable forecast window',
    description: 'Show the period, evidence and assumptions behind every prediction.',
  },
];

export function PredictionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Planned intelligence"
        title="Predictions"
        description="Predictive analytics will be enabled when a real forecasting backend is implemented and validated."
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
          icon={<BrainCircuit size={22} />}
          title="No prediction model is active yet"
          description="The current application persists and analyses transaction totals without presenting invented forecasts or confidence scores."
        />
      </div>
    </>
  );
}
