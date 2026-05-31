import { AlertTriangle, BellRing, CheckCircle2 } from 'lucide-react';
import { AlertsPanel } from '../components/dashboard/AlertsPanel';
import { MetricCard } from '../components/dashboard/MetricCard';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyStateCard } from '../components/ui/EmptyStateCard';
import { alerts } from '../data/dashboardData';

export function AlertsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Anomaly monitoring"
        title="Alerts"
        description="Review duplicated subscriptions, suspicious charges and spending deviations detected by the AI engine."
      />

      <section className="mb-6 grid gap-5 md:grid-cols-3">
        <MetricCard
          title="Open alerts"
          value="3"
          detail="Pending user review"
          trend="warning"
          icon={<BellRing size={20} />}
        />
        <MetricCard
          title="High priority"
          value="1"
          detail="Requires attention"
          trend="warning"
          icon={<AlertTriangle size={20} />}
        />
        <MetricCard
          title="Resolved this month"
          value="8"
          detail="Reviewed and closed"
          trend="down"
          icon={<CheckCircle2 size={20} />}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <AlertsPanel alerts={alerts} />
        <EmptyStateCard
          icon={<AlertTriangle size={22} />}
          title="Alert details panel"
          description="When the backend is connected, selecting an alert will show related transactions, detection reason, confidence score and recommended actions."
        />
      </section>
    </>
  );
}
