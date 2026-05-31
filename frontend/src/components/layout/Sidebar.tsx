import {
  Bell,
  Brain,
  CreditCard,
  LayoutDashboard,
  LineChart,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';

const navigationItems = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: CreditCard, label: 'Transactions' },
  { icon: LineChart, label: 'Predictions' },
  { icon: Bell, label: 'Alerts' },
  { icon: ShieldCheck, label: 'Security' },
];

export function Sidebar() {
  return (
    <aside className="border-r border-slate-200 bg-white px-6 py-6">
      <div className="mb-10 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-soft">
          <Brain size={25} />
        </div>
        <div>
          <p className="text-lg font-bold tracking-tight">Smart Expense AI</p>
          <p className="text-sm text-slate-500">Predictive finance</p>
        </div>
      </div>

      <nav className="space-y-2" aria-label="Main navigation">
        {navigationItems.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
              item.active
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <item.icon size={18} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-10 rounded-3xl bg-slate-950 p-5 text-white shadow-soft">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
          <WalletCards size={20} />
        </div>
        <p className="mb-2 text-sm font-semibold">AI Insight</p>
        <p className="text-sm leading-6 text-slate-300">
          Your spending is trending 12% above your usual monthly average.
        </p>
      </div>
    </aside>
  );
}
