import type { FinancialAccountPurpose, FinancialAccountType } from '@smart-expense-ai/api-contracts';
import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import { useMemo, useState } from 'react';

import Ionicons from '../../ui/Icon';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from '../../ui/primitives';
import { ConnectionStatus } from '../../components/ConnectionStatus';
import { WorkspaceNav } from '../../components/WorkspaceNav';
import type { LocalFinancialAccountRow } from '../../database/types';
import { useConflicts } from '../../sync/useConflicts';
import { useForegroundSync } from '../../sync/useForegroundSync';
import { MobileBankLogo, MobileBankPicker } from './bankCatalog';
import { useFinancialAccounts } from './useFinancialAccounts';

const ACCOUNT_TYPES: readonly [FinancialAccountType, string][] = [
  ['checking', 'Corriente'],
  ['savings', 'Ahorro'],
  ['broker', 'Broker'],
  ['wallet', 'Wallet'],
  ['cash', 'Efectivo'],
  ['other', 'Otro'],
];

const PURPOSES: readonly [FinancialAccountPurpose, string][] = [
  ['daily', 'Día a día'],
  ['savings', 'Ahorro'],
  ['emergency_fund', 'Emergencia'],
  ['opportunities', 'Oportunidades'],
  ['investment', 'Inversión'],
  ['other', 'Otro'],
];

const STATUS_LABEL = {
  synced: 'Sincronizado',
  pending: 'Pendiente',
  conflict: 'Conflicto',
  failed: 'Revisar',
} as const;

function formatEuro(minor: number): string {
  const negative = minor < 0;
  const absolute = Math.abs(minor);
  const whole = Math.floor(absolute / 100).toLocaleString('es-ES');
  const cents = String(absolute % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole},${cents} €`;
}

function relativeUpdated(value: string): string {
  const then = Date.parse(value);
  if (!Number.isFinite(then)) return 'Actualizado recientemente';
  const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Actualizado hoy';
  if (days === 1) return 'Actualizado ayer';
  return `Actualizado hace ${days} días`;
}

function typeLabel(value: FinancialAccountType): string {
  return ACCOUNT_TYPES.find(([key]) => key === value)?.[1] ?? value;
}

function purposeLabel(value: FinancialAccountPurpose): string {
  return PURPOSES.find(([key]) => key === value)?.[1] ?? value;
}

function HistoryBars({ points }: { points: readonly { totalMinor: number; pending: boolean }[] }) {
  const visible = points.slice(-24);
  if (visible.length < 2) {
    return <Text style={styles.muted}>Actualiza tus saldos con el tiempo para ver aquí la evolución.</Text>;
  }
  const values = visible.map((point) => point.totalMinor);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return (
    <View style={styles.chart} accessibilityLabel="Evolución del patrimonio">
      {visible.map((point, index) => {
        const height = 18 + ((point.totalMinor - min) / span) * 82;
        return (
          <View key={`${index}-${point.totalMinor}`} style={styles.chartColumn}>
            <View
              style={[
                styles.chartBar,
                { height: `${height}%`, opacity: point.pending ? 0.45 : 1 },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

interface AccountFormState {
  name: string;
  institution: string;
  accountType: FinancialAccountType;
  purpose: FinancialAccountPurpose;
  currentBalance: string;
  includeInNetWorth: boolean;
}

const EMPTY_FORM: AccountFormState = {
  name: '',
  institution: '',
  accountType: 'checking',
  purpose: 'daily',
  currentBalance: '',
  includeInNetWorth: true,
};

export function MoneyScreen() {
  const {
    accounts,
    summary,
    history,
    isLoading,
    isSaving,
    error,
    reload,
    create,
    updateMetadata,
    updateBalance,
    archive,
  } = useFinancialAccounts();
  const {
    conflicts,
    isResolving,
    error: conflictError,
    reload: reloadConflicts,
    resolveWithServer,
    retryMine,
  } = useConflicts(reload);
  const { isSyncing, error: syncError, syncNow, refreshHealth } = useForegroundSync(async () => {
    await reload();
    await reloadConflicts();
  });

  const [formMode, setFormMode] = useState<'closed' | 'create' | 'edit'>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountFormState>(EMPTY_FORM);
  const [balanceAccount, setBalanceAccount] = useState<LocalFinancialAccountRow | null>(null);
  const [nextBalance, setNextBalance] = useState('');

  const accountConflicts = conflicts.filter((conflict) => conflict.entity_type === 'financial_account');
  const changeMinor = history.length >= 2
    ? history[history.length - 1]!.totalMinor - history[0]!.totalMinor
    : 0;
  const pendingHistory = history.some((point) => point.pending);

  const breakdown = useMemo(() => [
    ['Disponible', summary.available],
    ['Reservado', summary.reserved],
    ['Invertido', summary.invested],
  ] as const, [summary]);

  const closeForm = () => {
    setFormMode('closed');
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormMode('create');
  };

  const openEdit = (account: LocalFinancialAccountRow) => {
    setEditingId(account.id);
    setForm({
      name: account.name,
      institution: account.institution ?? '',
      accountType: account.account_type,
      purpose: account.purpose,
      currentBalance: minorUnitsToDecimal(account.current_balance_minor),
      includeInNetWorth: account.include_in_net_worth === 1,
    });
    setFormMode('edit');
  };

  const submitForm = async () => {
    try {
      if (formMode === 'create') {
        await create({
          ...form,
          institution: form.institution || null,
        });
      } else if (formMode === 'edit' && editingId) {
        await updateMetadata(editingId, {
          name: form.name,
          institution: form.institution || null,
          accountType: form.accountType,
          purpose: form.purpose,
          includeInNetWorth: form.includeInNetWorth,
        });
      }
      closeForm();
      await refreshHealth();
      void syncNow().then(reloadConflicts).catch(() => undefined);
    } catch {
      // Hook error state owns user-visible failures.
    }
  };

  const submitBalance = async () => {
    if (!balanceAccount) return;
    try {
      await updateBalance(balanceAccount.id, nextBalance);
      setBalanceAccount(null);
      setNextBalance('');
      await refreshHealth();
      void syncNow().then(reloadConflicts).catch(() => undefined);
    } catch {
      // Hook error state owns user-visible failures.
    }
  };

  const requestArchive = (account: LocalFinancialAccountRow) => {
    Alert.alert(
      '¿Archivar cuenta?',
      `${account.name} dejará de aparecer y de sumar al patrimonio. Su historial se conservará.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Archivar',
          style: 'destructive',
          onPress: () => {
            void archive(account.id)
              .then(refreshHealth)
              .then(() => syncNow())
              .then(reloadConflicts)
              .catch(() => undefined);
          },
        },
      ],
    );
  };

  const busy = isSaving || isResolving;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={isSyncing}
            onRefresh={() => { void syncNow().catch(() => undefined); }}
          />
        )}
      >
        <WorkspaceNav active="money" />

        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>PATRIMONIO · OFFLINE-FIRST</Text>
            <Text style={styles.title}>Mi dinero</Text>
            <Text style={styles.subtitle}>Todo lo que tienes, aunque esté repartido entre bancos, brokers y efectivo.</Text>
          </View>
          <Pressable disabled={busy} onPress={openCreate} style={styles.addButton}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addButtonText}>Cuenta</Text>
          </Pressable>
        </View>

        <ConnectionStatus refreshing={isSyncing} onRefresh={() => { void syncNow().catch(() => undefined); }} />
        {syncError ? <Text style={styles.error}>{syncError}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>PATRIMONIO TOTAL</Text>
          <Text style={styles.heroAmount}>{formatEuro(summary.total)}</Text>
          <View style={styles.breakdownRow}>
            {breakdown.map(([label, value]) => (
              <View key={label} style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>{label}</Text>
                <Text style={styles.breakdownValue}>{formatEuro(value)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.purposeGrid}>
          <View style={styles.purposeCard}><Text style={styles.purposeLabel}>Día a día</Text><Text style={styles.purposeValue}>{formatEuro(summary.daily)}</Text></View>
          <View style={styles.purposeCard}><Text style={styles.purposeLabel}>Ahorro</Text><Text style={styles.purposeValue}>{formatEuro(summary.savings)}</Text></View>
          <View style={styles.purposeCard}><Text style={styles.purposeLabel}>Emergencia</Text><Text style={styles.purposeValue}>{formatEuro(summary.emergencyFund)}</Text></View>
          <View style={styles.purposeCard}><Text style={styles.purposeLabel}>Oportunidades</Text><Text style={styles.purposeValue}>{formatEuro(summary.opportunities)}</Text></View>
        </View>

        {accountConflicts.length > 0 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Conflictos de Mi dinero</Text>
            <Text style={styles.muted}>La misma cuenta cambió en otro dispositivo o en la web.</Text>
            {accountConflicts.map((conflict) => (
              <View key={conflict.id} style={styles.conflictCard}>
                <Text style={styles.cardTitle}>{conflict.reason}</Text>
                <Text style={styles.muted} numberOfLines={1}>{conflict.entity_id}</Text>
                <View style={styles.actionRow}>
                  <Pressable
                    disabled={isResolving}
                    onPress={() => void resolveWithServer(conflict.id).then(() => syncNow()).catch(() => undefined)}
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryText}>Usar servidor</Text>
                  </Pressable>
                  {conflict.reason === 'stale_version' && conflict.local_payload_json ? (
                    <Pressable
                      disabled={isResolving}
                      onPress={() => void retryMine(conflict.id).then(() => syncNow()).catch(() => undefined)}
                      style={styles.primaryButton}
                    >
                      <Text style={styles.primaryButtonText}>Reintentar lo mío</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
            {conflictError ? <Text style={styles.error}>{conflictError}</Text> : null}
          </View>
        ) : null}

        {formMode !== 'closed' ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{formMode === 'create' ? 'Añadir cuenta' : 'Editar cuenta'}</Text>
              <Pressable onPress={closeForm}><Ionicons name="close" size={24} color="#596575" /></Pressable>
            </View>

            <MobileBankPicker
              value={form.institution}
              onSelect={(bank) => {
                setForm((current) => ({
                  ...current,
                  institution: bank.name,
                  name: current.name.trim() ? current.name : bank.name,
                  accountType: bank.suggestedType,
                }));
              }}
              onManualChange={(institution) => setForm((current) => ({ ...current, institution }))}
            />

            <Text style={styles.fieldLabel}>Nombre de la cuenta</Text>
            <TextInput
              accessibilityLabel="Nombre de cuenta"
              value={form.name}
              onChangeText={(name) => setForm((current) => ({ ...current, name }))}
              placeholder="Ej. Ahorro, oportunidades, cuenta principal..."
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>Tipo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {ACCOUNT_TYPES.map(([value, label]) => (
                <Pressable
                  key={value}
                  onPress={() => setForm((current) => ({ ...current, accountType: value }))}
                  style={[styles.chip, form.accountType === value && styles.chipActive]}
                >
                  <Text style={[styles.chipText, form.accountType === value && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Finalidad</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {PURPOSES.map(([value, label]) => (
                <Pressable
                  key={value}
                  onPress={() => setForm((current) => ({ ...current, purpose: value }))}
                  style={[styles.chip, form.purpose === value && styles.chipActive]}
                >
                  <Text style={[styles.chipText, form.purpose === value && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {formMode === 'create' ? (
              <>
                <Text style={styles.fieldLabel}>Saldo actual</Text>
                <TextInput
                  accessibilityLabel="Saldo actual"
                  keyboardType="decimal-pad"
                  value={form.currentBalance}
                  onChangeText={(currentBalance) => setForm((current) => ({ ...current, currentBalance }))}
                  placeholder="1000,00"
                  style={styles.input}
                />
              </>
            ) : null}

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Incluir en patrimonio</Text>
                <Text style={styles.muted}>Desactívalo para cuentas informativas que no quieras sumar.</Text>
              </View>
              <Switch
                value={form.includeInNetWorth}
                onValueChange={(includeInNetWorth) => setForm((current) => ({ ...current, includeInNetWorth }))}
              />
            </View>
            <Pressable disabled={busy} onPress={() => void submitForm()} style={styles.primaryButtonWide}>
              <Text style={styles.primaryButtonText}>{isSaving ? 'Guardando…' : formMode === 'create' ? 'Añadir cuenta' : 'Guardar cambios'}</Text>
            </Pressable>
          </View>
        ) : null}

        {balanceAccount ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.balanceHeading}>
                <MobileBankLogo institution={balanceAccount.institution} fallbackName={balanceAccount.name} size={40} />
                <View>
                  <Text style={styles.sectionTitle}>Actualizar saldo</Text>
                  <Text style={styles.muted}>{balanceAccount.name} · actual {formatEuro(balanceAccount.current_balance_minor)}</Text>
                </View>
              </View>
              <Pressable onPress={() => setBalanceAccount(null)}><Ionicons name="close" size={24} color="#596575" /></Pressable>
            </View>
            <TextInput
              accessibilityLabel="Nuevo saldo"
              keyboardType="decimal-pad"
              value={nextBalance}
              onChangeText={setNextBalance}
              placeholder="1250,00"
              style={styles.input}
            />
            <Text style={styles.muted}>El saldo anterior no se borra: se guardará un nuevo punto en tu historial.</Text>
            <Pressable disabled={busy} onPress={() => void submitBalance()} style={styles.primaryButtonWide}>
              <Text style={styles.primaryButtonText}>Guardar nuevo saldo</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Mis cuentas</Text>
          <Text style={styles.muted}>{accounts.length} activas</Text>
        </View>
        {isLoading ? <ActivityIndicator /> : null}
        {!isLoading && accounts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={32} color="#125c47" />
            <Text style={styles.cardTitle}>Todavía no has añadido dinero</Text>
            <Text style={styles.muted}>Añade tu primera cuenta manualmente. No necesitas conectar ningún banco.</Text>
            <Pressable onPress={openCreate} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Añadir cuenta</Text></Pressable>
          </View>
        ) : null}

        {accounts.map((account) => (
          <View key={account.id} style={styles.accountCard}>
            <View style={styles.accountTopRow}>
              <MobileBankLogo institution={account.institution} fallbackName={account.name} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={styles.accountName}>{account.name}</Text>
                <Text style={styles.muted}>{typeLabel(account.account_type)} · {account.institution ?? 'Manual'}</Text>
              </View>
              <View style={styles.statusPill}><Text style={styles.statusText}>{STATUS_LABEL[account.sync_status]}</Text></View>
            </View>
            <Text style={styles.accountAmount}>{formatEuro(account.current_balance_minor)}</Text>
            <View style={styles.accountMetaRow}>
              <Text style={styles.purposeTag}>{purposeLabel(account.purpose)}</Text>
              <Text style={styles.muted}>{relativeUpdated(account.balance_updated_at)}</Text>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => { setBalanceAccount(account); setNextBalance(minorUnitsToDecimal(account.current_balance_minor)); }}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Saldo</Text>
              </Pressable>
              <Pressable onPress={() => openEdit(account)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Editar</Text></Pressable>
              <Pressable onPress={() => requestArchive(account)} style={styles.archiveButton}><Text style={styles.archiveText}>Archivar</Text></Pressable>
            </View>
          </View>
        ))}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Evolución del patrimonio</Text>
              <Text style={styles.muted}>Últimos 12 meses · snapshots manuales</Text>
            </View>
            {history.length >= 2 ? (
              <Text style={[styles.changeText, changeMinor < 0 && styles.negative]}>
                {changeMinor >= 0 ? '+' : ''}{formatEuro(changeMinor)}
              </Text>
            ) : null}
          </View>
          <HistoryBars points={history} />
          {pendingHistory ? <Text style={styles.pendingNote}>Hay puntos pendientes de sincronizar.</Text> : null}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Cómo se calcula</Text>
          <Text style={styles.muted}>Disponible = Día a día + Otro. Reservado = Ahorro + Emergencia + Oportunidades. Invertido = Inversión. Todo se calcula en céntimos enteros; la conversión decimal solo se usa para mostrar o sincronizar.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f6f8f7' },
  content: { padding: 18, paddingBottom: 120, gap: 16 },
  eyebrow: { color: '#527064', fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 31, fontWeight: '800', letterSpacing: -0.8, marginTop: 3 },
  subtitle: { color: '#596575', fontSize: 14, lineHeight: 20, marginTop: 5 },
  addButton: { backgroundColor: '#125c47', borderRadius: 16, paddingHorizontal: 14, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  addButtonText: { color: '#fff', fontWeight: '800' },
  hero: { backgroundColor: '#0f3f34', borderRadius: 28, padding: 22, gap: 10 },
  heroLabel: { color: '#b9d8cd', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  heroAmount: { color: '#fff', fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  breakdownRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  breakdownItem: { flex: 1, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 14, padding: 10 },
  breakdownLabel: { color: '#b9d8cd', fontSize: 10, fontWeight: '700' },
  breakdownValue: { color: '#fff', fontSize: 13, fontWeight: '800', marginTop: 4 },
  purposeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  purposeCard: { backgroundColor: '#fff', borderRadius: 18, padding: 14, width: '48%', borderWidth: 1, borderColor: '#e3eae6' },
  purposeLabel: { color: '#68756f', fontSize: 12, fontWeight: '700' },
  purposeValue: { fontSize: 17, fontWeight: '800', marginTop: 5 },
  sectionCard: { backgroundColor: '#fff', borderRadius: 22, padding: 17, gap: 12, borderWidth: 1, borderColor: '#e3eae6' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  fieldLabel: { color: '#47564f', fontSize: 12, fontWeight: '700', marginTop: 2 },
  input: { backgroundColor: '#f8faf9', borderWidth: 1, borderColor: '#dce5e0', borderRadius: 14, paddingHorizontal: 14, minHeight: 48, fontSize: 16 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, borderColor: '#d8e1dc', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  chipActive: { backgroundColor: '#dff3e9', borderColor: '#9ecbb9' },
  chipText: { color: '#596575', fontWeight: '700', fontSize: 12 },
  chipTextActive: { color: '#125c47' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  accountCard: { backgroundColor: '#fff', borderRadius: 22, padding: 17, gap: 13, borderWidth: 1, borderColor: '#e3eae6' },
  accountTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  accountName: { fontSize: 17, fontWeight: '800' },
  accountAmount: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  accountMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  purposeTag: { color: '#125c47', fontWeight: '800', fontSize: 12, backgroundColor: '#e6f4ee', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusPill: { backgroundColor: '#f1f4f2', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  statusText: { color: '#596575', fontSize: 10, fontWeight: '700' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  balanceHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  primaryButton: { backgroundColor: '#125c47', borderRadius: 13, minHeight: 42, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' },
  primaryButtonWide: { backgroundColor: '#125c47', borderRadius: 14, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  secondaryButton: { backgroundColor: '#f2f6f4', borderRadius: 13, minHeight: 42, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center' },
  secondaryText: { color: '#125c47', fontWeight: '800' },
  archiveButton: { minHeight: 42, paddingHorizontal: 10, justifyContent: 'center' },
  archiveText: { color: '#a23939', fontWeight: '700' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 22, padding: 20, gap: 10, alignItems: 'flex-start', borderWidth: 1, borderColor: '#e3eae6' },
  cardTitle: { fontWeight: '800', fontSize: 14 },
  muted: { color: '#65716b', fontSize: 12, lineHeight: 18 },
  error: { color: '#b42318', backgroundColor: '#fff0ee', borderRadius: 12, padding: 10, fontSize: 12 },
  conflictCard: { borderTopWidth: 1, borderTopColor: '#edf0ee', paddingTop: 12, gap: 8 },
  chart: { height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingTop: 8 },
  chartColumn: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  chartBar: { minHeight: 5, backgroundColor: '#2c8b6d', borderRadius: 5 },
  changeText: { color: '#167654', fontWeight: '800' },
  negative: { color: '#b42318' },
  pendingNote: { color: '#8b6a24', fontSize: 11, fontWeight: '700' },
});
