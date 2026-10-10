import { Plus, RefreshCw, TrendingUp, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { FinancialAccount } from '../../types/financialAccounts';
import type {
  InvestmentMovementType,
  InvestmentPortfolio,
  InvestmentPortfolioHistory,
  InvestmentPosition,
  InvestmentRange,
} from '../../types/investments';
import {
  createInvestmentPosition,
  fetchInvestmentHistory,
  fetchInvestmentPortfolios,
  refreshInvestmentNavs,
  updateInvestmentHoldings,
} from '../../services/investmentsApi';
import { getApiErrorPresentation, type ApiErrorPresentation } from '../../services/apiClient';
import { moneyToCents, normalizeMoneyAmount } from '../../utils/money';
import { ApiErrorAlert } from '../../components/ui/ApiErrorAlert';

const RANGE_OPTIONS: { value: InvestmentRange; label: string }[] = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '1y', label: '1A' },
  { value: 'all', label: 'Todo' },
];

const MOVEMENT_OPTIONS: { value: InvestmentMovementType; label: string }[] = [
  { value: 'contribution', label: 'Aportación' },
  { value: 'sale', label: 'Venta' },
  { value: 'transfer_in', label: 'Traspaso de entrada' },
  { value: 'transfer_out', label: 'Traspaso de salida' },
  { value: 'adjustment', label: 'Ajuste' },
];

function formatEuro(value: string): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(moneyToCents(value) / 100);
}

function formatPercent(value: string | null): string {
  if (value === null) return '—';
  const numeric = Number(value);
  return `${numeric >= 0 ? '+' : ''}${numeric.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} %`;
}

function normalizeUnits(value: string): string {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,8})?$/.test(normalized)) {
    throw new Error('Las participaciones deben tener hasta 8 decimales.');
  }
  return normalized;
}

function HistoryChart({ history }: { history: InvestmentPortfolioHistory | null }) {
  const points = history?.points ?? [];
  if (points.length < 2) {
    return (
      <div className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-slate-200 px-4 text-center text-xs text-slate-500">
        El gráfico se irá construyendo con cada nuevo VL público que guarde Smart Expense.
      </div>
    );
  }

  const width = 720;
  const height = 180;
  const padding = 18;
  const series = points.map((point) => ({
    date: point.date,
    value: moneyToCents(point.value),
    cost: moneyToCents(point.cost),
  }));
  const values = series.flatMap((point) => [point.value, point.cost]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const line = (selector: 'value' | 'cost') => series.map((point, index) => {
    const x = padding + (index / (series.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point[selector] - min) / span) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div>
      <div className="overflow-hidden rounded-2xl bg-slate-50 p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label="Capital aportado frente a valor actual">
          <polyline points={line('cost')} fill="none" stroke="#94a3b8" strokeWidth="4" strokeDasharray="8 8" />
          <polyline points={line('value')} fill="none" stroke="#0f766e" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-slate-500">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-teal-700" /> Valor actual</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400" /> Capital aportado</span>
      </div>
    </div>
  );
}

function PositionForm({
  brokerAccounts,
  editing,
  busy,
  onClose,
  onSaved,
}: {
  brokerAccounts: FinancialAccount[];
  editing: InvestmentPosition | null;
  busy: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [accountId, setAccountId] = useState(editing?.financialAccountId ?? brokerAccounts[0]?.id ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [isin, setIsin] = useState(editing?.isin ?? '');
  const [units, setUnits] = useState(editing?.units ?? '');
  const [costTotal, setCostTotal] = useState(editing?.costTotal ?? '');
  const [movementType, setMovementType] = useState<InvestmentMovementType>('contribution');
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState('');

  const submit = async () => {
    try {
      setLocalError('');
      const normalizedUnits = normalizeUnits(units);
      const normalizedCost = normalizeMoneyAmount(costTotal);
      if (editing) {
        await updateInvestmentHoldings(editing.id, {
          units: normalizedUnits,
          costTotal: normalizedCost,
          movementType,
          note: note.trim() || null,
        });
      } else {
        if (!accountId) throw new Error('Selecciona una cartera broker.');
        await createInvestmentPosition({
          financialAccountId: accountId,
          name: name.trim(),
          isin: isin.trim().toUpperCase(),
          units: normalizedUnits,
          costTotal: normalizedCost,
          currency: 'EUR',
        });
      }
      await onSaved();
      onClose();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'No se pudo guardar la posición.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <section className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Mi dinero · Inversiones</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-950">{editing ? 'Actualizar posición' : 'Añadir fondo'}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {localError && <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{localError}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {!editing && (
            <>
              <label className="sm:col-span-2 text-sm font-semibold text-slate-700">
                Cartera
                <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal">
                  {brokerAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Fondo
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Fidelity S&P 500" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal" />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                ISIN
                <input value={isin} onChange={(event) => setIsin(event.target.value.toUpperCase())} maxLength={12} placeholder="IE00BYX5MX67" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-mono font-normal uppercase" />
              </label>
            </>
          )}
          <label className="text-sm font-semibold text-slate-700">
            Participaciones
            <input inputMode="decimal" value={units} onChange={(event) => setUnits(event.target.value)} placeholder="292.12345678" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal" />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Coste total
            <input inputMode="decimal" value={costTotal} onChange={(event) => setCostTotal(event.target.value)} placeholder="3879.82" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal" />
          </label>
          {editing && (
            <>
              <label className="text-sm font-semibold text-slate-700">
                Movimiento
                <select value={movementType} onChange={(event) => setMovementType(event.target.value as InvestmentMovementType)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal">
                  {MOVEMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Nota
                <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Aportación octubre" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal" />
              </label>
            </>
          )}
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          No se guardan credenciales de MyInvestor. El saldo de la cartera se calcula con participaciones × último VL; si todavía no existe VL, se usa temporalmente el coste aportado.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Cancelar</button>
          <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'Guardando...' : editing ? 'Guardar movimiento' : 'Añadir posición'}
          </button>
        </div>
      </section>
    </div>
  );
}

export function InvestmentPortfolioSection({
  accounts,
  onChanged,
}: {
  accounts: FinancialAccount[];
  onChanged: () => Promise<void>;
}) {
  const brokerAccounts = useMemo(() => accounts.filter((account) => account.accountType === 'broker'), [accounts]);
  const [portfolios, setPortfolios] = useState<InvestmentPortfolio[]>([]);
  const [range, setRange] = useState<InvestmentRange>('1y');
  const [histories, setHistories] = useState<Record<string, InvestmentPortfolioHistory>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<InvestmentPosition | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorPresentation | null>(null);
  const [refreshNote, setRefreshNote] = useState('');

  const load = useCallback(async (selectedRange: InvestmentRange = range) => {
    const result = await fetchInvestmentPortfolios();
    setPortfolios(result);
    const historyPairs = await Promise.all(result.map(async (portfolio) => [
      portfolio.financialAccountId,
      await fetchInvestmentHistory(portfolio.financialAccountId, selectedRange),
    ] as const));
    setHistories(Object.fromEntries(historyPairs));
  }, [range]);

  useEffect(() => {
    let active = true;
    void load()
      .then(async () => {
        if (!active) return;
        const refreshed = await refreshInvestmentNavs(false);
        if (!active) return;
        if (refreshed.results.some((item) => item.status === 'updated')) {
          await load();
          await onChanged();
        }
      })
      .catch((caught) => {
        if (active) setError(getApiErrorPresentation(caught, 'No se han podido cargar las inversiones.'));
      });
    return () => { active = false; };
  }, [load, onChanged]);

  const changeRange = async (next: InvestmentRange) => {
    try {
      setRange(next);
      await load(next);
    } catch (caught) {
      setError(getApiErrorPresentation(caught, 'No se pudo cargar el histórico de inversiones.'));
    }
  };

  const refresh = async (force: boolean) => {
    try {
      setBusy(true);
      setError(null);
      const result = await refreshInvestmentNavs(force);
      const updated = result.results.filter((item) => item.status === 'updated').length;
      const failed = result.results.filter((item) => item.status === 'failed').length;
      setRefreshNote(`${updated} VL actualizados${failed ? ` · ${failed} fuente(s) no disponibles` : ''}`);
      await load();
      await onChanged();
    } catch (caught) {
      setError(getApiErrorPresentation(caught, 'No se pudieron actualizar los valores liquidativos.'));
    } finally {
      setBusy(false);
    }
  };

  const saved = async () => {
    setBusy(true);
    try {
      await refreshInvestmentNavs(true);
      await load();
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Mi dinero · Inversiones</p>
          <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-950"><TrendingUp size={22} /> Carteras y fondos</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">Seguimiento por ISIN y participaciones. El valor de cada cartera se incorpora automáticamente al patrimonio.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={busy || portfolios.length === 0} onClick={() => void refresh(true)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-50">
            <RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> Actualizar VL
          </button>
          <button type="button" disabled={brokerAccounts.length === 0} onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            <Plus size={16} /> Fondo
          </button>
        </div>
      </div>

      {error && <ApiErrorAlert error={error} className="mt-5" onRetry={() => void load()} />}
      {refreshNote && <p className="mt-4 text-xs font-medium text-slate-500">{refreshNote}</p>}
      {brokerAccounts.length === 0 && (
        <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Crea primero una cuenta de tipo «Broker / inversión», por ejemplo MyInvestor.</p>
      )}

      <div className="mt-6 grid gap-5">
        {portfolios.map((portfolio) => (
          <article key={portfolio.financialAccountId} className="rounded-3xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-500">{portfolio.institution || 'Broker'}</p>
                <h3 className="mt-1 text-xl font-bold text-slate-950">{portfolio.name}</h3>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-slate-950">{formatEuro(portfolio.totalValue)}</p>
                <p className={moneyToCents(portfolio.gainAmount) >= 0 ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-rose-700'}>
                  {formatEuro(portfolio.gainAmount)} · {formatPercent(portfolio.gainPercent)}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {portfolio.positions.map((position) => (
                <div key={position.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">{position.name}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">{position.isin}</p>
                    </div>
                    <button type="button" onClick={() => setEditing(position)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">Participaciones</button>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xl font-bold text-slate-950">{formatEuro(position.currentValue)}</p>
                      <p className={moneyToCents(position.gainAmount) >= 0 ? 'text-xs font-semibold text-emerald-700' : 'text-xs font-semibold text-rose-700'}>
                        {formatEuro(position.gainAmount)} · {formatPercent(position.gainPercent)}
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p>{position.units} participaciones</p>
                      <p>Coste {formatEuro(position.costTotal)}</p>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">
                    {position.latestNav !== null ? (
                      <p>
                        VL {position.latestNav} € · {position.navDate ? new Intl.DateTimeFormat('es-ES').format(new Date(`${position.navDate}T12:00:00Z`)) : 'sin fecha'}
                        {position.navSourceUrl && (
                          <> · <a href={position.navSourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-700">fuente</a></>
                        )}
                      </p>
                    ) : (
                      <p>VL pendiente · valor provisional = coste aportado.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {portfolio.positions.length > 0 && (
              <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-950">Distribución de la cartera</p>
                    <p className="text-xs text-slate-500">Peso por valor actual</p>
                  </div>
                  <p className="text-xs text-slate-500">
                    Último VL: {portfolio.latestValuationDate
                      ? new Intl.DateTimeFormat('es-ES').format(new Date(`${portfolio.latestValuationDate}T12:00:00Z`))
                      : 'pendiente'}
                  </p>
                </div>
                <div className="mt-4 space-y-3">
                  {portfolio.positions.map((position) => {
                    const portfolioCents = Math.max(0, moneyToCents(portfolio.totalValue));
                    const positionCents = Math.max(0, moneyToCents(position.currentValue));
                    const weight = portfolioCents > 0 ? (positionCents / portfolioCents) * 100 : 0;
                    return (
                      <div key={`allocation-${position.id}`}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                          <span className="truncate font-semibold text-slate-700">{position.name}</span>
                          <span className="font-semibold text-slate-500">{weight.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(0, Math.min(100, weight))}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-950">Rentabilidad total</p>
                  <p className="text-xs text-slate-500">Capital aportado vs. valor de mercado</p>
                </div>
                <div className="flex rounded-xl bg-slate-100 p-1">
                  {RANGE_OPTIONS.map((option) => (
                    <button key={option.value} type="button" onClick={() => void changeRange(option.value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${range === option.value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <HistoryChart history={histories[portfolio.financialAccountId] ?? null} />
            </div>
          </article>
        ))}
      </div>

      {showCreate && (
        <PositionForm brokerAccounts={brokerAccounts} editing={null} busy={busy} onClose={() => setShowCreate(false)} onSaved={saved} />
      )}
      {editing && (
        <PositionForm brokerAccounts={brokerAccounts} editing={editing} busy={busy} onClose={() => setEditing(null)} onSaved={saved} />
      )}
    </section>
  );
}
