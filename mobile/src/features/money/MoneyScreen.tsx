import type { FinancialAccountPurpose, FinancialAccountType } from '@smart-expense-ai/api-contracts';
import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import { useCallback, useMemo, useState } from 'react';

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
import { suggestedMobileAccountNameForInstitution } from './bankCatalogData';
import { useFinancialAccounts } from './useFinancialAccounts';
import { InvestmentSection } from './InvestmentSection';

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

function purposeForType(
  accountType: FinancialAccountType,
  requestedPurpose: FinancialAccountPurpose,
): FinancialAccountPurpose {
  return accountType === 'broker' ? 'investment' : requestedPurpose;
}

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

  const refreshInvestmentServerState = useCallback(async () => {
    await refreshHealth();
    await syncNow();
  }, [refreshHealth, syncNow]);

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
      purpose: purposeForType(account.account_type, account.purpose),
      currentBalance: minorUnitsToDecimal(account.current_balance_minor),
      includeInNetWorth: account.include_in_net_worth === 1,
    });
    setFormMode('edit');
  };

  const submitForm = async () => {
    try {
      const normalizedForm = {
        ...form,
        purpose: purposeForType(form.accountType, form.purpose),
      };
      if (formMode === 'create') {
        await create({
          ...normalizedForm,
          institution: normalizedForm.institution || null,
        });
      } else if (formMode === 'edit' && editingId) {
        await updateMetadata(editingId, {
          name: normalizedForm.name,
          institution: normalizedForm.institution || null,
          accountType: normalizedForm.accountType,
          purpose: normalizedForm.purpose,
          includeInNetWorth: normalizedForm.includeInNetWorth,
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

        <InvestmentSection accounts={accounts} onServerChanged={refreshInvestmentServerState} />

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
                  name: suggestedMobileAccountNameForInstitution(
                    current.name,
                    current.institution,
                    bank.name,
                  ),
                  accountType: bank.suggestedType,
                  purpose: purposeForType(bank.suggestedType, current.purpose),
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
                  onPress={() => setForm((current) => ({
                    ...current,
                    accountType: value,
                    purpose: purposeForType(value, current.purpose),
                  }))}
                  style={[styles.chip, form.accountType === value && styles.chipActive]}
                >
                  <Text style={[styles.chipText, form.accountType === value && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Finalidad</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {PURPOSES.map(([value, label]) => {
                const effectivePurpose = purposeForType(form.accountType, form.purpose);
                const lockedByBroker = form.accountType === 'broker' && value !== 'investment';
                return (
                  <Pressable
                    key={value}
                    disabled={lockedByBroker}
                    onPress={() => setForm((current) => ({
                      ...current,
                      purpose: purposeForType(current.accountType, value),
                    }))}
                    style={[
                      styles.chip,
                      effectivePurpose === value && styles.chipActive,
                      lockedByBroker && styles.chipDisabled,
                    ]}
                  >
                    <Text style={[
                      styles.chipText,
                      effectivePurpose === value && styles.chipTextActive,
                      lockedByBroker && styles.chipTextDisabled,
                    ]}>{label}</Text>
                  </Pressable>
                );
              })}
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
                testID="money-include-net-worth-switch"
                value={form.includeInNetWorth}
                onValueChange={(includeInNetWorth) => setForm((current) => ({ ...current, includeInNetWorth }))}
              />
            </View>
            <Pressable
              testID="money-account-submit"
              disabled={busy}
              onPress={() => void submitForm()}
              style={styles.primaryButtonWide}
            >
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
              <Pressable onPress={() => openEdit(account)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Editar</Text></Pressable>
              <Pressable
                onPress={() => {
                  setBalanceAccount(account);
                  setNextBalance(minorUnitsToDecimal(account.current_balance_minor));
                }}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Actualizar saldo</Text>
              </Pressable>
              <Pressable onPress={() => requestArchive(account)} style={styles.archiveButton}><Text style={styles.archiveText}>Archivar</Text></Pressable>
            </View>
          </View>
        ))}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Evolución del patrimonio</Text>
            <Text style={styles.muted}>Últimos 12 meses · snapshots manuales</Text>
          </View>
          <HistoryBars points={history} />
          {history.length >= 2 ? (
            <Text style={[styles.changeText, changeMinor < 0 && styles.negative]}>
              {changeMinor >= 0 ? '+' : ''}{formatEuro(changeMinor)} desde el primer punto visible
              {pendingHistory ? ' · incluye cambios pendientes de sincronizar' : ''}
            </Text>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Cómo se calcula</Text>
          <Text style={styles.muted}>
            Disponible = Día a día + Otro. Reservado = Ahorro + Emergencia + Oportunidades. Invertido = Inversión. Todo se calcula en céntimos enteros; la conversión decimal solo se usa para mostrar o sincronizar.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f3f7f5' },
  content: { paddingHorizontal: 18, paddingBottom: 32, gap: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: '#23755f' },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '900', color: '#0f172a', marginTop: 2 },
  subtitle: { fontSize: 15, lineHeight: 21, color: '#627068', marginTop: 4 },
  addButton: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: '#126b52', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  addButtonText: { color: '#fff', fontWeight: '800' },
  hero: { backgroundColor: '#0f5f49', borderRadius: 24, padding: 22, gap: 14 },
  heroLabel: { color: '#bce6d9', fontWeight: '800', letterSpacing: 1.1, fontSize: 12 },
  heroAmount: { color: '#fff', fontWeight: '900', fontSize: 36 },
  breakdownRow: { flexDirection: 'row', gap: 8 },
  breakdownItem: { flex: 1, gap: 2 },
  breakdownLabel: { color: '#bce6d9', fontSize: 11, fontWeight: '700' },
  breakdownValue: { color: '#fff', fontSize: 14, fontWeight: '800' },
  purposeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  purposeCard: { width: '48%', backgroundColor: '#fff', borderWidth: 1, borderColor: '#dae5df', padding: 14, borderRadius: 16 },
  purposeLabel: { color: '#6b786f', fontSize: 12, fontWeight: '700' },
  purposeValue: { color: '#172033', fontSize: 18, fontWeight: '900', marginTop: 3 },
  sectionCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce6e0', borderRadius: 20, padding: 16, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: '#101827', fontSize: 20, fontWeight: '900' },
  cardTitle: { color: '#172033', fontSize: 14, fontWeight: '800' },
  fieldLabel: { color: '#263443', fontWeight: '800', fontSize: 13, marginTop: 2 },
  input: { borderWidth: 1, borderColor: '#d4dfda', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fbfdfc', color: '#13201b' },
  chips: { gap: 8, paddingRight: 8 },
  chip: { borderWidth: 1, borderColor: '#cfdad5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  chipActive: { backgroundColor: '#d9efe7', borderColor: '#126b52' },
  chipDisabled: { opacity: 0.35 },
  chipText: { color: '#5c6962', fontWeight: '700' },
  chipTextActive: { color: '#0f5f49' },
  chipTextDisabled: { color: '#8d9892' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  primaryButton: { backgroundColor: '#126b52', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 13, alignSelf: 'flex-start' },
  primaryButtonWide: { backgroundColor: '#126b52', paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  secondaryButton: { borderWidth: 1, borderColor: '#b8c9c1', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  secondaryText: { color: '#285d4d', fontWeight: '800' },
  archiveButton: { paddingHorizontal: 8, paddingVertical: 9 },
  archiveText: { color: '#ad3535', fontWeight: '800' },
  emptyCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce6e0', padding: 20, borderRadius: 20, gap: 12 },
  accountCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce6e0', borderRadius: 20, padding: 16, gap: 10 },
  accountTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accountName: { color: '#111827', fontSize: 18, fontWeight: '900' },
  accountAmount: { color: '#101827', fontSize: 28, fontWeight: '900' },
  accountMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  purposeTag: { backgroundColor: '#e3f3ed', color: '#156148', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, fontWeight: '800', fontSize: 12 },
  statusPill: { backgroundColor: '#eef3f0', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { color: '#627068', fontSize: 11, fontWeight: '800' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  balanceHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  conflictCard: { backgroundColor: '#fff8eb', borderWidth: 1, borderColor: '#f1d7a7', padding: 12, borderRadius: 14, gap: 8 },
  muted: { color: '#6b776f', lineHeight: 20 },
  error: { color: '#a32626', fontWeight: '700' },
  chart: { height: 130, flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingTop: 8 },
  chartColumn: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  chartBar: { width: '100%', minWidth: 3, backgroundColor: '#22a27c', borderRadius: 4 },
  changeText: { color: '#126b52', fontWeight: '800' },
  negative: { color: '#ad3535' },
});