import { Database, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { MetricCard } from '../components/dashboard/MetricCard';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyStateCard } from '../components/ui/EmptyStateCard';

const securityItems = [
  'Sensitive financial data must never be written to frontend logs.',
  'Authentication will be handled by the FastAPI backend using secure tokens or sessions.',
  'Bank integrations should be added only after encryption and privacy controls are defined.',
];

export function SecurityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Privacy and security"
        title="Security"
        description="Define the security principles required before connecting real financial data or bank integrations."
      />

      <section className="grid gap-5 md:grid-cols-3">
        <MetricCard
          title="Auth status"
          value="Planned"
          detail="Backend integration pending"
          trend="neutral"
          icon={<KeyRound size={20} />}
        />
        <MetricCard
          title="Data isolation"
          value="Required"
          detail="Per-user authorization"
          trend="neutral"
          icon={<Database size={20} />}
        />
        <MetricCard
          title="Security level"
          value="MVP"
          detail="Design phase"
          trend="neutral"
          icon={<ShieldCheck size={20} />}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <LockKeyhole size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Security checklist</h2>
              <p className="text-sm text-slate-500">Minimum controls before production</p>
            </div>
          </div>

          <div className="space-y-4">
            {securityItems.map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 p-4 text-sm leading-6 text-slate-600">
                {item}
              </div>
            ))}
          </div>
        </article>

        <EmptyStateCard
          icon={<ShieldCheck size={22} />}
          title="Security module pending"
          description="This page will later include session status, connected devices, privacy settings, data export and account deletion controls."
        />
      </section>
    </>
  );
}
