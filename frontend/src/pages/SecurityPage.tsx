import { Cookie, Database, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { MetricCard } from '../components/dashboard/MetricCard';
import { PageHeader } from '../components/layout/PageHeader';

const securityItems = [
  'Passwords are hashed with Argon2 before persistence and are never returned by the API.',
  'The signed session token is stored in an HttpOnly, SameSite=Lax cookie instead of browser storage.',
  'Transaction list, update and delete queries are scoped by the authenticated user ID.',
  'Cross-account transaction IDs return 404 so ownership information is not disclosed.',
];

export function SecurityPage() {
  const { user } = useAuth();

  return (
    <>
      <PageHeader
        eyebrow="Privacy and security"
        title="Security"
        description="Authentication and per-user financial data isolation are active in the current MVP."
      />

      <section className="grid gap-5 md:grid-cols-3">
        <MetricCard
          title="Authentication"
          value="Active"
          detail="FastAPI session authentication"
          trend="down"
          icon={<KeyRound size={20} />}
        />
        <MetricCard
          title="Data isolation"
          value="Enforced"
          detail="Transactions scoped by user ID"
          trend="down"
          icon={<Database size={20} />}
        />
        <MetricCard
          title="Session"
          value="HttpOnly"
          detail="Signed JWT cookie"
          trend="down"
          icon={<Cookie size={20} />}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <LockKeyhole size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Implemented controls</h2>
              <p className="text-sm text-slate-500">Current account and API guarantees</p>
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

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Current session</h2>
              <p className="text-sm text-slate-500">Authenticated account</p>
            </div>
          </div>
          <dl className="space-y-4 text-sm">
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-slate-400">Display name</dt>
              <dd className="mt-1 font-semibold text-slate-900">{user?.displayName}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-slate-400">Email</dt>
              <dd className="mt-1 font-semibold text-slate-900">{user?.email}</dd>
            </div>
          </dl>
          <p className="mt-5 text-xs leading-5 text-slate-400">
            Connected-device management, password reset, account deletion and privacy exports remain future production-readiness work.
          </p>
        </article>
      </section>
    </>
  );
}
