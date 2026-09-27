import {
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { ApiErrorAlert } from '../components/ui/ApiErrorAlert';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { buildFinancialAccountEditPayload, purposeForAccountType } from '../features/money/accountDraft';
import { BankInstitutionPicker, BankLogo } from '../features/money/bankCatalog';
import {
  archiveFinancialAccount,
  createFinancialAccount,
  fetchFinancialAccounts,
  fetchNetWorthHistory,
  fetchNetWorthSummary,
  updateFinancialAccount,
  updateFinancialAccountBalance,
} from '../services/financialAccountsApi';
import { getApiErrorPresentation, type ApiErrorPresentation } from '../services/apiClient';
import type {
  FinancialAccount,
  FinancialAccountDraft,
  FinancialAccountPurpose,
  FinancialAccountType,
  NetWorthHistory,
  NetWorthSummary,
} from '../types/financialAccounts';
import { moneyToCents, normalizeMoneyAmount } from '../utils/money';

const TYPE_OPTIONS: { value: FinancialAccountType; label: string }[] = [
  { value: 'checking', label: 'Cuenta corriente' },
  { value: 'savings', label: 'Cuenta de ahorro' },
  { value: 'broker', label: 'Broker / inversión' },
  { value: 'wallet', label: 'Wallet / aplicación' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'other', label: 'Otro' },
];

const PURPOSE_OPTIONS: { value: FinancialAccountPurpose; label: string }[] = [
  { value: 'daily', label: 'Día a día' },
  { value: 'savings', label: 'Ahorro' },
  { value: 'emergency_fund', label: 'Fondo de emergencia' },
  { value: 'opportunities', label: 'Oportunidades' },
  { value: 'investment', label: 'Inversión' },
  { value: 'other', label: 'Otro' },
];

const EMPTY_DRAFT: FinancialAccountDraft = {
  name: '',
  institution: '',
  accountType: 'checking',
  purpose: 'daily',
  currentBalance: '',
  currency: 'EUR',
  includeInNetWorth: true,
};

function formatEuro(value: string): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(moneyToCents(value) / 100);
}

function purposeLabel(value: FinancialAccountPurpose): string {
  return PURPOSE_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function typeLabel(value: FinancialAccountType): string {
  return TYPE_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function relativeUpdatedAt(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  if (sameDay) return 'Actualizado hoy';
  return `Actualizado ${new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(date)}`;
}

function NetWorthChart({ history }: { history: NetWorthHistory }) {
  const plotted = useMemo(
    () => history.points.map((point) => ({ ...point, cents: moneyToCents(point.totalNetWorth) })),
    [history.points],
  );
  if (plotted.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-500">
        Actualiza tus saldos con el tiempo para ver aquí la evolución de tu patrimonio.
      </div>
    );
  }

  const width = 900;
  const height = 260;
  const padding = 30;
  const values = plotted.map((point) => point.cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = plotted
    .map((point, index) => {
      const x = padding + (index / (plotted.length - 1)) * (width - padding * 2);
      const y = height - padding - ((point.cents - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Últimos {history.months} meses</p>
          <p className="mt-1 text-sm text-slate-500">
            Cambio: <span className={moneyToCents(history.changeAmount) >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>{formatEuro(history.changeAmount)}</span>
            {history.changePercent !== null && ` · ${history.changePercent}%`}
          </p>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl bg-slate-50 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución del patrimonio" className="h-64 w-full">
          {[0.25, 0.5, 0.75].map((fraction) => (
            <line
              key={fraction}
              x1={padding}
              x2={width - padding}
              y1={padding + fraction * (height - padding * 2)}
              y2={padding + fraction * (height - padding * 2)}
              stroke="currentColor"
              className="text-slate-200"
              strokeWidth="1"
            />
          ))}
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            className="text-brand-600"
            strokeWidth="5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {plotted.map((point, index) => {
            const x = padding + (index / (plotted.length - 1)) * (width - padding * 2);
            const y = height - padding - ((point.cents - min) / range) * (height - padding * 2);
            return <circle key={`${point.recordedAt}-${index}`} cx={x} cy={y} r="5" fill="currentColor" className="text-brand-600" />;
          })}
        </svg>
      </div>
    </div>
  );
}

function AccountForm({
  title,
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  title: string;
  initial: FinancialAccountDraft;
  submitLabel: string;
  busy: boolean;
  onSubmit: (draft: FinancialAccountDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const effectivePurpose = purposeForAccountType(draft.accountType, draft.purpose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Mi dinero</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{title}</h2>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onCancel} className="rounded-xl border border-slate-200 p-2 text-slate-500">
            <X size={18} />
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit({ ...draft, purpose: effectivePurpose });
          }}
          className="grid gap-4 md:grid-cols-2"
        >
          <BankInstitutionPicker
            value={draft.institution}
            onSelect={(bank) => {
              setDraft((current) => ({
                ...current,
                institution: bank.name,
                name: current.name.trim() ? current.name : bank.name,
                accountType: bank.suggestedType,
                purpose: purposeForAccountType(bank.suggestedType, current.purpose),
              }));
            }}
            onManualChange={(institution) => {
              setDraft((current) => ({ ...current, institution }));
            }}
          />

          <label className="text-sm font-semibold text-slate-700">
            Nombre de la cuenta
            <input
              required
              maxLength={120}
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ej. Ahorro, oportunidades, cuenta principal..."
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Tipo
            <select
              value={draft.accountType}
              onChange={(event) => {
                const accountType = event.target.value as FinancialAccountType;
                setDraft((current) => ({
                  ...current,
                  accountType,
                  purpose: purposeForAccountType(accountType, current.purpose),
                }));
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal"
            >
              {TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Finalidad
            <select
              value={effectivePurpose}
              disabled={draft.accountType === 'broker'}
              onChange={(event) => setDraft((current) => ({
                ...current,
                purpose: purposeForAccountType(
                  current.accountType,
                  event.target.value as FinancialAccountPurpose,
                ),
              }))}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal disabled:bg-slate-50 disabled:text-slate-500"
            >
              {PURPOSE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            {draft.accountType === 'broker' && (
              <span className="mt-1 block text-xs font-normal text-slate-500">Los brokers siempre se contabilizan como inversión.</span>
            )}
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Saldo actual
            <input
              required
              inputMode="decimal"
              value={draft.currentBalance}
              onChange={(event) => setDraft((current) => ({ ...current, currentBalance: event.target.value }))}
              placeholder="1000.00"
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Moneda
            <select disabled value="EUR" className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-normal text-slate-500">
              <option value="EUR">EUR</option>
            </select>
          </label>
          <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={draft.includeInNetWorth}
              onChange={(event) => setDraft((current) => ({ ...current, includeInNetWorth: event.target.checked }))}
              className="h-4 w-4"
            />
            Incluir esta cuenta en mi patrimonio total
          </label>
          <div className="md:col-span-2 mt-2 flex justify-end gap-3">
            <button type="button" onClick={onCancel} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600">
              Cancelar
            </button>
            <button type="submit" disabled={busy} className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? 'Guardando...' : submitLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function MoneyPage() {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [summary, setSummary] = useState<NetWorthSummary | null>(null);
  const [history, setHistory] = useState<NetWorthHistory | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<FinancialAccount | null>(null);
  const [balanceAccount, setBalanceAccount] = useState<FinancialAccount | null>(null);
  const [balanceValue, setBalanceValue] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState<FinancialAccount | null>(null);
  const [error, setError] = useState<ApiErrorPresentation | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [accountResult, summaryResult, historyResult] = await Promise.all([
        fetchFinancialAccounts(),
        fetchNetWorthSummary(),
        fetchNetWorthHistory(12),
      ]);
      setAccounts(accountResult);
      setSummary(summaryResult);
      setHistory(historyResult);
    } catch (loadError) {
      setError(getApiErrorPresentation(loadError, 'No se ha podido cargar Mi dinero.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (draft: FinancialAccountDraft) => {
    try {
      setBusy(true);
      setError(null);
      await createFinancialAccount({
        ...draft,
        name: draft.name.trim(),
        institution: draft.institution.trim(),
        purpose: purposeForAccountType(draft.accountType, draft.purpose),
        currentBalance: normalizeMoneyAmount(draft.currentBalance),
      });
      setShowCreate(false);
      setMessage('Cuenta añadida y primer saldo guardado en el historial.');
      await load();
    } catch (createError) {
      setError(getApiErrorPresentation(createError, 'No se ha podido añadir la cuenta.'));
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = async (draft: FinancialAccountDraft) => {
    if (!editing) return;
    try {
      setBusy(true);
      setError(null);
      await updateFinancialAccount(editing.id, buildFinancialAccountEditPayload(editing, draft));
      setEditing(null);
      setMessage('Cuenta actualizada.');
      await load();
    } catch (editError) {
      setError(getApiErrorPresentation(editError, 'No se ha podido actualizar la cuenta.'));
    } finally {
      setBusy(false);
    }
  };

  const handleBalanceUpdate = async () => {
    if (!balanceAccount) return;
    try {
      setBusy(true);
      setError(null);
      await updateFinancialAccountBalance(balanceAccount.id, normalizeMoneyAmount(balanceValue));
      setBalanceAccount(null);
      setBalanceValue('');
      setMessage('Nuevo saldo guardado. El saldo anterior se conserva en el historial.');
      await load();
    } catch (balanceError) {
      setError(getApiErrorPresentation(balanceError, 'No se ha podido actualizar el saldo.'));
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!deleteCandidate) return;
    try {
      setBusy(true);
      setError(null);
      await archiveFinancialAccount(deleteCandidate.id);
      setDeleteCandidate(null);
      setMessage('Cuenta archivada. Su historial se conserva.');
      await load();
    } catch (archiveError) {
      setError(getApiErrorPresentation(archiveError, 'No se ha podido archivar la cuenta.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <PageHeader
        eyebrow="Patrimonio"
        title="Mi dinero"
        description="Una vista manual y privada de cuánto dinero tienes, dónde está y para qué lo estás reservando."
        action={(
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-soft">
            <Plus size={17} />
            Añadir cuenta
          </button>
        )}
      />

      {error && <ApiErrorAlert error={error} className="mb-6" onRetry={() => void load()} />}
      {message && <p role="status" className="mb-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>}

      {loading || !summary ? (
        <p className="text-sm text-slate-500">Cargando patrimonio...</p>
      ) : (
        <>
          <section className="mb-8 overflow-hidden rounded-3xl bg-slate-950 p-7 text-white shadow-soft">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Patrimonio total</p>
              <p className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">{formatEuro(summary.totalNetWorth)}</p>
            </div>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {[
                ['Disponible', summary.available],
                ['Reservado', summary.reserved],
                ['Invertido', summary.invested],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-white/10 p-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">{label}</p>
                  <p className="mt-2 text-xl font-bold">{formatEuro(value)}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Emergencia', summary.emergencyFund],
                ['Oportunidades', summary.opportunities],
                ['Ahorro', summary.savings],
                ['Día a día', summary.daily],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3">
                  <span className="text-sm text-slate-400">{label}</span>
                  <span className="text-sm font-semibold">{formatEuro(value)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-8">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Cuentas</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">Mis cuentas</h2>
              </div>
              <p className="text-sm text-slate-500">{accounts.length} {accounts.length === 1 ? 'cuenta' : 'cuentas'}</p>
            </div>
            {accounts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <WalletCards className="mx-auto text-slate-400" />
                <h3 className="mt-4 font-bold text-slate-950">Todavía no has añadido cuentas</h3>
                <p className="mt-2 text-sm text-slate-500">Añade bancos, brokers, wallets o efectivo. No se conecta con ninguna entidad: tú controlas los saldos manualmente.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {accounts.map((account) => (
                  <article key={account.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <BankLogo institution={account.institution} fallbackName={account.name} />
                        <div className="min-w-0">
                          <h3 className="truncate font-bold text-slate-950">{account.name}</h3>
                          <p className="truncate text-xs text-slate-500">{account.institution || typeLabel(account.accountType)}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          aria-label={`Editar ${account.name}`}
                          onClick={() => setEditing(account)}
                          className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Archivar ${account.name}`}
                          onClick={() => setDeleteCandidate(account)}
                          className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <p className="mt-7 text-3xl font-bold tracking-tight text-slate-950">{formatEuro(account.currentBalance)}</p>
                    <div className="mt-6 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-brand-700">{purposeLabel(account.purpose)}</p>
                        <p className="mt-1 text-xs text-slate-400">{relativeUpdatedAt(account.balanceUpdatedAt)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setBalanceAccount(account);
                          setBalanceValue(account.currentBalance);
                        }}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Actualizar saldo
                      </button>
                    </div>
                    {!account.includeInNetWorth && (
                      <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">No incluida en el patrimonio total.</p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
                <ShieldCheck size={19} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">Evolución de tu patrimonio</h2>
                <p className="text-sm text-slate-500">Cada actualización manual conserva el saldo anterior como evidencia histórica.</p>
              </div>
            </div>
            {history && <NetWorthChart history={history} />}
          </section>
        </>
      )}

      {showCreate && (
        <AccountForm
          title="Añadir cuenta"
          initial={EMPTY_DRAFT}
          submitLabel="Añadir"
          busy={busy}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {editing && (
        <AccountForm
          title={`Editar ${editing.name}`}
          initial={{
            name: editing.name,
            institution: editing.institution ?? '',
            accountType: editing.accountType,
            purpose: purposeForAccountType(editing.accountType, editing.purpose),
            currentBalance: editing.currentBalance,
            currency: 'EUR',
            includeInNetWorth: editing.includeInNetWorth,
          }}
          submitLabel="Guardar"
          busy={busy}
          onSubmit={handleEdit}
          onCancel={() => setEditing(null)}
        />
      )}

      {balanceAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <BankLogo institution={balanceAccount.institution} fallbackName={balanceAccount.name} className="h-10 w-10" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Actualizar saldo</p>
                  <h2 className="mt-1 text-2xl font-bold">{balanceAccount.name}</h2>
                </div>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setBalanceAccount(null)} className="rounded-xl border border-slate-200 p-2 text-slate-500">
                <X size={18} />
              </button>
            </div>
            <label className="mt-6 block text-sm font-semibold text-slate-700">
              Nuevo saldo
              <input
                autoFocus
                inputMode="decimal"
                value={balanceValue}
                onChange={(event) => setBalanceValue(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal"
              />
            </label>
            <p className="mt-3 text-xs leading-5 text-slate-500">El saldo actual cambiará, pero el anterior seguirá guardado en el historial.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setBalanceAccount(null)} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancelar</button>
              <button type="button" disabled={busy} onClick={() => void handleBalanceUpdate()} className="rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? 'Guardando...' : 'Guardar saldo'}
              </button>
            </div>
          </section>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteCandidate !== null}
        title="¿Archivar esta cuenta?"
        description={`La cuenta ${deleteCandidate?.name ?? ''} dejará de aparecer y de contar en el patrimonio total. Su historial de saldos no se elimina.`}
        confirmLabel="Archivar cuenta"
        isConfirming={busy}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={() => void handleArchive()}
      />
    </main>
  );
}
