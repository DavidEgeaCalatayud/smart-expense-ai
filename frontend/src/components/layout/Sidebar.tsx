import {
  Bell,
  Brain,
  CreditCard,
  Database,
  LayoutDashboard,
  LineChart,
  LogOut,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { ROUTES } from '../../routes/paths';

const navigationItems = [
  { icon: LayoutDashboard, label: 'Dashboard', to: ROUTES.dashboard },
  { icon: CreditCard, label: 'Transactions', to: ROUTES.transactions },
  { icon: LineChart, label: 'Predictions', to: ROUTES.predictions },
  { icon: Bell, label: 'Alerts', to: ROUTES.alerts },
  { icon: ShieldCheck, label: 'Security', to: ROUTES.security },
];

export function Sidebar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate(ROUTES.login, { replace: true });
  };

  return (
    <aside className="border-r border-slate-200 bg-white px-6 py-6">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-soft">
          <Brain size={25} />
        </div>
        <div>
          <p className="text-lg font-bold tracking-tight">Smart Expense AI</p>
          <p className="text-sm text-slate-500">Personal finance workspace</p>
        </div>
      </div>

      <nav className="space-y-2" aria-label="Main navigation">
        {navigationItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.to === ROUTES.dashboard}
            className={({ isActive }) =>
              `flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-10 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-600 shadow-sm">
            <UserRound size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{user?.displayName}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>

      <div className="mt-4 rounded-3xl bg-slate-950 p-5 text-white shadow-soft">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
          <Database size={20} />
        </div>
        <p className="mb-2 text-sm font-semibold">Account-isolated data</p>
        <p className="text-sm leading-6 text-slate-300">
          Transaction queries are scoped to your authenticated user before financial data leaves the API.
        </p>
      </div>
    </aside>
  );
}
