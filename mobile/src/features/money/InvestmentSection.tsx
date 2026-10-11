import { decimalToMinorUnits } from '@smart-expense-ai/domain-types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { readServerCache, writeServerCache } from '../../database/serverCacheRepository';
import type { LocalFinancialAccountRow } from '../../database/types';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from '../../ui/primitives';
import {
  createInvestmentPosition,
  fetchInvestmentHistory,
  fetchInvestmentMovements,
  fetchInvestmentPortfolios,
  refreshInvestmentNavs,
  updateInvestmentHoldings,
  type InvestmentMovementType,
  type InvestmentRange,
  type MobileInvestmentHistory,
  type MobileInvestmentMovement,
  type MobileInvestmentPortfolio,
  type MobileInvestmentPosition,
} from './investmentApi';

const RANGES: readonly [InvestmentRange, string][] = [
  ['1m', '1M'],
  ['3m', '3M'],
  ['1y', '1A'],
  ['all', 'Todo'],
];

const MOVEMENTS: readonly [InvestmentMovementType, string][] = [
  ['contribution', 'Aportación'],
  ['sale', 'Venta'],
  ['transfer_in', 'Traspaso +'],
  ['transfer_out', 'Traspaso −'],
  ['adjustment', 'Ajuste'],
];

const MOVEMENT_LABELS: Record<MobileInvestmentMovement['movementType'], string> = {
  initial: 'Posición inicial',
  contribution: 'Aportación',
  sale: 'Venta',
  transfer_in: 'Traspaso de entrada',
  transfer_out: 'Traspaso de salida',
  adjustment: 'Ajuste',
};

function euro(decimal: string): string {
  const minor = decimalToMinorUnits(decimal);
  const negative = minor < 0;
  const absolute = Math.abs(minor);
  const whole = Math.floor(absolute / 100).toLocaleString('es-ES');
  const cents = String(absolute % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole},${cents} €`;
}

function percent(value: string | null): string {
  if (value === null) return '—';
  const number = Number(value);
  return `${number >= 0 ? '+' : ''}${number.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} %`;
}

function averageCost(position: MobileInvestmentPosition): string {
  const units = Number(position.units);
  if (!Number.isFinite(units) || units <= 0) return '—';
  const average = Number(position.costTotal) / units;
  return `${average.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })} €/part.`;
}

function normalizeUnits(value: string): string {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,8})?$/.test(normalized)) {
    throw new Error('Participaciones: usa un número con hasta 8 decimales.');
  }
  return normalized;
}

function normalizeCost(value: string): string {
  const normalized = value.trim().replace(',', '.');
  decimalToMinorUnits(normalized);
  return normalized;
}

function InvestmentBars({ history }: { history: MobileInvestmentHistory | undefined }) {
  const points = (history?.points ?? []).slice(-16);
  if (points.length < 2) {
    return <Text style={styles.muted}>El histórico se irá formando al guardar nuevos VL.</Text>;
  }
  const values = points.flatMap((point) => [Number(point.value), Number(point.cost)]);
  const maximum = Math.max(1, ...values);
  return (
    <View style={styles.barChart} accessibilityLabel="Capital aportado frente a valor actual">
      {points.map((point) => (
        <View key={point.date} style={styles.barColumn}>
          <View
            style={[
              styles.valueBar,
              { height: Math.max(3, (Number(point.value) / maximum) * 72) },
            ]}
          />
          <View
            style={[
              styles.costMarker,
              { bottom: Math.max(0, (Number(point.cost) / maximum) * 72) },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

function PositionEditor({
  brokerAccounts,
  position,
  busy,
  onCancel,
  onSaved,
}: {
  brokerAccounts: LocalFinancialAccountRow[];
  position: MobileInvestmentPosition | null;
  busy: boolean;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [accountId, setAccountId] = useState(position?.financialAccountId ?? brokerAccounts[0]?.id ?? '');
  const [name, setName] = useState(position?.name ?? '');
  const [isin, setIsin] = useState(position?.isin ?? '');
  const [units, setUnits] = useState(position?.units ?? '');
  const [cost, setCost] = useState(position?.costTotal ?? '');
  const [movement, setMovement] = useState<InvestmentMovementType>('contribution');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      setError(null);
      const normalizedUnits = normalizeUnits(units);
      const normalizedCost = normalizeCost(cost);
      if (position) {
        await updateInvestmentHoldings(position.id, {
          units: normalizedUnits,
          costTotal: normalizedCost,
          movementType: movement,
          note: note.trim() || null,
        });
      } else {
        if (!accountId) throw new Error('Selecciona una cartera broker.');
        if (!name.trim()) throw new Error('Indica el nombre del fondo.');
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
      onCancel();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar la posición.');
    }
  };

  return (
    <View style={styles.editor}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{position ? 'Actualizar posición' : 'Añadir fondo'}</Text>
        <Pressable onPress={onCancel}><Text style={styles.link}>Cerrar</Text></Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!position ? (
        <>
          <Text style={styles.fieldLabel}>Cartera</Text>
          <View style={styles.chips}>
            {brokerAccounts.map((account) => (
              <Pressable
                key={account.id}
                onPress={() => setAccountId(account.id)}
                style={[styles.chip, accountId === account.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, accountId === account.id && styles.chipTextActive]}>{account.name}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>Fondo</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Fidelity S&P 500" style={styles.input} />
          <Text style={styles.fieldLabel}>ISIN</Text>
          <TextInput
            value={isin}
            onChangeText={(value) => setIsin(value.toUpperCase())}
            autoCapitalize="characters"
            maxLength={12}
            placeholder="IE00BYX5MX67"
            style={styles.input}
          />
        </>
      ) : null}

      <Text style={styles.fieldLabel}>Participaciones</Text>
      <TextInput
        value={units}
        onChangeText={setUnits}
        keyboardType="decimal-pad"
        placeholder="292.12345678"
        style={styles.input}
      />
      <Text style={styles.fieldLabel}>Coste total</Text>
      <TextInput value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="3879.82" style={styles.input} />

      {position ? (
        <>
          <Text style={styles.fieldLabel}>Movimiento</Text>
          <View style={styles.chips}>
            {MOVEMENTS.map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => setMovement(value)}
                style={[styles.chip, movement === value && styles.chipActive]}
              >
                <Text style={[styles.chipText, movement === value && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>Nota</Text>
          <TextInput value={note} onChangeText={setNote} placeholder="Aportación octubre" style={styles.input} />
        </>
      ) : null}

      <Text style={styles.muted}>No se guardan credenciales de MyInvestor. Si todavía no hay VL, el coste aportado se usa como valoración provisional.</Text>
      <Pressable disabled={busy} onPress={() => void save()} style={styles.primaryButtonWide}>
        <Text style={styles.primaryButtonText}>{busy ? 'Guardando…' : position ? 'Guardar movimiento' : 'Añadir posición'}</Text>
      </Pressable>
    </View>
  );
}

interface CachedInvestmentWorkspace {
  portfolios: MobileInvestmentPortfolio[];
  histories: Record<string, MobileInvestmentHistory>;
}

export function InvestmentSection({
  accounts,
  onServerChanged,
}: {
  accounts: LocalFinancialAccountRow[];
  onServerChanged: () => Promise<void>;
}) {
  const db = useSQLiteContext();
  const brokerAccounts = useMemo(
    () => accounts.filter((account) => account.account_type === 'broker'),
    [accounts],
  );
  const [portfolios, setPortfolios] = useState<MobileInvestmentPortfolio[]>([]);
  const [histories, setHistories] = useState<Record<string, MobileInvestmentHistory>>({});
  const [range, setRange] = useState<InvestmentRange>('1y');
  const [editing, setEditing] = useState<MobileInvestmentPosition | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [movementHistory, setMovementHistory] = useState<Record<string, MobileInvestmentMovement[]>>({});
  const [movementLoading, setMovementLoading] = useState<string | null>(null);

  const load = useCallback(async (selectedRange: InvestmentRange = range): Promise<boolean> => {
    const cacheKey = `investment-workspace:${selectedRange}`;
    const cached = await readServerCache<CachedInvestmentWorkspace>(db, cacheKey);
    if (cached) {
      setPortfolios(cached.value.portfolios);
      setHistories(cached.value.histories);
    }

    try {
      const next = await fetchInvestmentPortfolios();
      const pairs = await Promise.all(next.map(async (portfolio) => [
        portfolio.financialAccountId,
        await fetchInvestmentHistory(portfolio.financialAccountId, selectedRange),
      ] as const));
      const nextHistories = Object.fromEntries(pairs);
      setPortfolios(next);
      setHistories(nextHistories);
      await writeServerCache<CachedInvestmentWorkspace>(
        db,
        cacheKey,
        { portfolios: next, histories: nextHistories },
      );
      setRefreshNote(null);
      return true;
    } catch (caught) {
      if (cached) {
        setRefreshNote(
          `Sin conexión · última cartera guardada ${new Date(cached.fetchedAt).toLocaleString('es-ES')}`,
        );
        return false;
      }
      throw caught;
    }
  }, [db, range]);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => load())
      .then(async (online) => {
        if (!active || !online) return;
        const result = await refreshInvestmentNavs(false);
        if (!active) return;
        if (result.results.some((item) => item.status === 'updated')) {
          await load();
          await onServerChanged();
        }
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'No se pudieron cargar las inversiones.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [load, onServerChanged]);

  const refresh = async (force: boolean) => {
    try {
      setBusy(true);
      setError(null);
      const result = await refreshInvestmentNavs(force);
      const updated = result.results.filter((item) => item.status === 'updated').length;
      const failed = result.results.filter((item) => item.status === 'failed').length;
      setRefreshNote(`${updated} VL actualizados${failed ? ` · ${failed} fallos` : ''}`);
      await load();
      await onServerChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudieron actualizar los VL.');
    } finally {
      setBusy(false);
    }
  };

  const saved = async () => {
    setBusy(true);
    try {
      await refreshInvestmentNavs(true);
      await load();
      await onServerChanged();
    } finally {
      setBusy(false);
    }
  };

  const changeRange = async (next: InvestmentRange) => {
    try {
      setRange(next);
      await load(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cargar el histórico.');
    }
  };

  const toggleMovements = async (positionId: string) => {
    if (movementHistory[positionId]) {
      setMovementHistory((current) => {
        const next = { ...current };
        delete next[positionId];
        return next;
      });
      return;
    }
    try {
      setMovementLoading(positionId);
      setError(null);
      const rows = await fetchInvestmentMovements(positionId);
      setMovementHistory((current) => ({ ...current, [positionId]: rows }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudieron cargar los movimientos.');
    } finally {
      setMovementLoading(null);
    }
  };

  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>INVERSIONES · ISIN + VL</Text>
          <Text style={styles.sectionTitle}>Carteras y fondos</Text>
        </View>
        <Pressable disabled={busy || portfolios.length === 0} onPress={() => void refresh(true)} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Actualizar VL</Text>
        </Pressable>
      </View>
      <Text style={styles.muted}>Participaciones × último valor liquidativo. La valoración entra automáticamente en tu patrimonio.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {refreshNote ? <Text style={styles.muted}>{refreshNote}</Text> : null}
      {loading ? <ActivityIndicator /> : null}

      {brokerAccounts.length === 0 ? (
        <Text style={styles.warning}>Crea una cuenta de tipo Broker, por ejemplo MyInvestor, para añadir fondos.</Text>
      ) : (
        <Pressable disabled={busy} onPress={() => setCreating(true)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>+ Fondo</Text>
        </Pressable>
      )}

      {creating ? (
        <PositionEditor
          brokerAccounts={brokerAccounts}
          position={null}
          busy={busy}
          onCancel={() => setCreating(false)}
          onSaved={saved}
        />
      ) : null}

      {editing ? (
        <PositionEditor
          brokerAccounts={brokerAccounts}
          position={editing}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSaved={saved}
        />
      ) : null}

      {portfolios.map((portfolio) => (
        <View key={portfolio.financialAccountId} style={styles.portfolioCard}>
          <View style={styles.sectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{portfolio.name}</Text>
              <Text style={styles.muted}>{portfolio.institution ?? 'Broker'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.portfolioValue}>{euro(portfolio.totalValue)}</Text>
              <Text style={Number(portfolio.gainAmount) >= 0 ? styles.positive : styles.negative}>
                {euro(portfolio.gainAmount)} · {percent(portfolio.gainPercent)}
              </Text>
            </View>
          </View>

          {portfolio.positions.map((position) => (
            <View key={position.id} style={styles.positionCard}>
              <View style={styles.sectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{position.name}</Text>
                  <Text style={styles.isin}>{position.isin}</Text>
                </View>
                <View style={styles.positionActions}>
                  <Pressable onPress={() => void toggleMovements(position.id)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryText}>
                      {movementHistory[position.id] ? 'Ocultar movimientos' : 'Movimientos'}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => setEditing(position)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryText}>Participaciones</Text>
                  </Pressable>
                </View>
              </View>
              <Text style={styles.positionValue}>{euro(position.currentValue)}</Text>
              <Text style={Number(position.gainAmount) >= 0 ? styles.positive : styles.negative}>
                {euro(position.gainAmount)} · {percent(position.gainPercent)}
              </Text>
              <Text style={styles.muted}>
                {position.units} participaciones · coste {euro(position.costTotal)} · medio {averageCost(position)}
              </Text>
              <Text style={styles.muted}>
                {position.latestNav
                  ? `VL ${position.latestNav} € · ${position.navDate ?? 'sin fecha'}`
                  : 'VL pendiente · valoración provisional por coste'}
              </Text>
              {movementLoading === position.id ? <ActivityIndicator /> : null}
              {movementHistory[position.id] ? (
                <View style={styles.movementList}>
                  {movementHistory[position.id]!.map((movement) => (
                    <View key={movement.id} style={styles.movementRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.movementTitle}>{MOVEMENT_LABELS[movement.movementType]}</Text>
                        <Text style={styles.muted}>
                          {new Date(movement.occurredAt).toLocaleDateString('es-ES')}
                          {movement.note ? ` · ${movement.note}` : ''}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.movementValue}>{movement.unitsAfter} part.</Text>
                        <Text style={styles.muted}>{euro(movement.costTotalAfter)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}

          {portfolio.positions.length > 0 ? (
            <View style={styles.allocationCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.cardTitle}>Distribución</Text>
                  <Text style={styles.muted}>Peso por valor actual</Text>
                </View>
                <Text style={styles.muted}>Último VL · {portfolio.latestValuationDate ?? 'pendiente'}</Text>
              </View>
              {portfolio.positions.map((position) => {
                const totalMinor = Math.max(0, decimalToMinorUnits(portfolio.totalValue));
                const positionMinor = Math.max(0, decimalToMinorUnits(position.currentValue));
                const weight = totalMinor > 0 ? (positionMinor / totalMinor) * 100 : 0;
                const width = `${Math.max(0, Math.min(100, weight))}%` as `${number}%`;
                return (
                  <View key={`allocation-${position.id}`} style={styles.allocationRow}>
                    <View style={styles.sectionHeader}>
                      <Text style={[styles.muted, { flex: 1 }]} numberOfLines={1}>{position.name}</Text>
                      <Text style={styles.allocationPercent}>
                        {weight.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
                      </Text>
                    </View>
                    <View style={styles.allocationTrack}>
                      <View style={[styles.allocationFill, { width }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.rangeRow}>
            {RANGES.map(([value, label]) => (
              <Pressable key={value} onPress={() => void changeRange(value)} style={[styles.rangeChip, range === value && styles.rangeChipActive]}>
                <Text style={[styles.rangeText, range === value && styles.rangeTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.muted}>Capital aportado vs. valor actual</Text>
          <InvestmentBars history={histories[portfolio.financialAccountId]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce6e0', borderRadius: 20, padding: 16, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: '#101827', fontSize: 20, fontWeight: '900' },
  eyebrow: { color: '#23755f', fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  cardTitle: { color: '#172033', fontSize: 15, fontWeight: '800' },
  muted: { color: '#6b776f', lineHeight: 19, fontSize: 12 },
  warning: { color: '#8a5a12', backgroundColor: '#fff8e7', borderRadius: 12, padding: 12, fontSize: 12 },
  error: { color: '#a32626', fontWeight: '700', fontSize: 12 },
  link: { color: '#126b52', fontWeight: '800' },
  primaryButton: { backgroundColor: '#126b52', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 13, alignSelf: 'flex-start' },
  primaryButtonWide: { backgroundColor: '#126b52', paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  secondaryButton: { borderWidth: 1, borderColor: '#b8c9c1', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 },
  secondaryText: { color: '#285d4d', fontWeight: '800', fontSize: 12 },
  portfolioCard: { borderWidth: 1, borderColor: '#e2e8e4', borderRadius: 18, padding: 14, gap: 12 },
  portfolioValue: { color: '#101827', fontSize: 20, fontWeight: '900' },
  positionCard: { backgroundColor: '#f7faf8', borderRadius: 15, padding: 12, gap: 6 },
  positionActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 },
  positionValue: { color: '#101827', fontSize: 22, fontWeight: '900' },
  movementList: { borderTopWidth: 1, borderTopColor: '#e2e8e4', marginTop: 6, paddingTop: 8, gap: 8 },
  movementRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  movementTitle: { color: '#263443', fontSize: 12, fontWeight: '800' },
  movementValue: { color: '#172033', fontSize: 12, fontWeight: '800' },
  positive: { color: '#137a57', fontSize: 12, fontWeight: '800' },
  negative: { color: '#ad3535', fontSize: 12, fontWeight: '800' },
  isin: { color: '#68756e', fontSize: 11, fontFamily: 'monospace' },
  editor: { borderWidth: 1, borderColor: '#cfe0d8', backgroundColor: '#f9fcfa', borderRadius: 16, padding: 14, gap: 10 },
  fieldLabel: { color: '#263443', fontWeight: '800', fontSize: 12 },
  input: { borderWidth: 1, borderColor: '#d4dfda', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', color: '#13201b' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderWidth: 1, borderColor: '#cfdad5', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  chipActive: { backgroundColor: '#d9efe7', borderColor: '#126b52' },
  chipText: { color: '#5c6962', fontWeight: '700', fontSize: 11 },
  chipTextActive: { color: '#0f5f49' },
  allocationCard: { backgroundColor: '#f7faf8', borderRadius: 15, padding: 12, gap: 10 },
  allocationRow: { gap: 5 },
  allocationPercent: { color: '#285d4d', fontWeight: '800', fontSize: 11 },
  allocationTrack: { height: 7, borderRadius: 999, overflow: 'hidden', backgroundColor: '#e2e8e4' },
  allocationFill: { height: 7, borderRadius: 999, backgroundColor: '#17765a' },
  rangeRow: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: '#f1f5f3', borderRadius: 11, padding: 3 },
  rangeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  rangeChipActive: { backgroundColor: '#fff' },
  rangeText: { color: '#6b776f', fontWeight: '700', fontSize: 11 },
  rangeTextActive: { color: '#0f5f49' },
  barChart: { height: 82, flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingTop: 8 },
  barColumn: { flex: 1, height: 74, justifyContent: 'flex-end', position: 'relative' },
  valueBar: { width: '100%', backgroundColor: '#17765a', borderRadius: 4 },
  costMarker: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#94a3b8' },
});
