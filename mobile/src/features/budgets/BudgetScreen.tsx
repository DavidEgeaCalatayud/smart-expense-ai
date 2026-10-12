import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ScrollView as NativeScrollView, TextInput as NativeTextInput } from 'react-native';
import {
  Alert,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
 SafeAreaView } from '../../ui/primitives';

import { createServerDerivedApi } from '../../api/serverDerivedApi';
import { useCachedServerResource } from '../../api/useCachedServerResource';
import { DataFreshness } from '../../components/DataFreshness';
import { useAuth } from '../../auth/AuthProvider';
import { WorkspaceNav } from '../../components/WorkspaceNav';
import { ConnectionStatus } from '../../components/ConnectionStatus';
import { useConflicts } from '../../sync/useConflicts';
import { useForegroundSync } from '../../sync/useForegroundSync';
import { usePresupuestos } from './usePresupuestos';
import { Snackbar } from '../../ui/Snackbar';
import { CardSkeleton } from '../../ui/Skeleton';
import { ActionPressable } from '../../ui/ActionPressable';
import { canonicalMoneyInput, formatMoneyInput } from '../../ui/moneyInput';

const STATUS_LABEL = {
  synced: 'Synced',
  pending: 'Pending sync',
  failed: 'Needs attention',
  conflict: 'Conflict',
} as const;

function localCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function BudgetScreen() {
  const { user, logout, isSubmitting: isAuthSubmitting } = useAuth();
  const [month, setMonth] = useState(localCurrentMonth());
  const api = useMemo(() => createServerDerivedApi(), []);
  const progressLoader = useCallback(async () => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Introduce un mes con formato AAAA-MM.');
    return api.getBudgetProgress(month);
  }, [api, month]);
  const progress = useCachedServerResource(`server:budget-progress:v1:${month}`, progressLoader);
  const {
    budgets,
    expenseCategories,
    isLoading,
    isSaving,
    error,
    reload,
    create,
    update,
    remove,
  } = usePresupuestos(month);
  const {
    conflicts,
    isResolving,
    error: conflictError,
    reload: reloadConflicts,
    resolveWithServer,
    retryMine,
  } = useConflicts(reload);
  const {
    isSyncing,
    error: syncError,
    syncNow,
    refreshHealth,
  } = useForegroundSync(async () => {
    await reload();
    await reloadConflicts();
  });

  const [limitAmount, setLimitAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const scrollViewRef = useRef<NativeScrollView>(null);
  const limitInputRef = useRef<NativeTextInput>(null);
  const formYRef = useRef<number | null>(null);
  const pendingRevealRef = useRef(false);
  const [formHighlighted, setFormHighlighted] = useState(false);

  const revealForm = () => {
    pendingRevealRef.current = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const y = formYRef.current;
      if (y === null || !pendingRevealRef.current) return;
      pendingRevealRef.current = false;
      scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
      setFormHighlighted(true);
      setTimeout(() => setFormHighlighted(false), 900);
      setTimeout(() => limitInputRef.current?.focus(), 260);
    }));
  };

  const categoryName = useMemo(() => {
    if (categoryId === null) {
      return 'Presupuesto mensual general';
    }
    return expenseCategories.find((category) => category.id === categoryId)?.name ?? 'Categoría';
  }, [categoryId, expenseCategories]);

  const resetForm = () => {
    setEditingId(null);
    setLimitAmount('');
    setCategoryId(null);
  };

  const submit = async () => {
    try {
      const wasEditing = editingId !== null;
      if (editingId) {
        await update(editingId, limitAmount);
      } else {
        await create(categoryId, limitAmount);
      }
      resetForm();
      setToast(wasEditing ? 'Presupuesto actualizado' : 'Presupuesto creado');
      await refreshHealth();
      void syncNow().then(reloadConflicts).catch(() => undefined);
    } catch {
      // Hook state owns user-visible validation/persistence errors.
    }
  };

  const requestEliminar = (budgetId: string, label: string) => {
    Alert.alert('¿Eliminar presupuesto?', label, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          void remove(budgetId)
            .then(() => setToast('Presupuesto eliminado'))
            .then(refreshHealth)
            .then(() => syncNow())
            .then(reloadConflicts)
            .catch(() => undefined);
        },
      },
    ]);
  };

  const busy = isSaving || isResolving;
  const budgetConflicts = conflicts.filter((conflict) => conflict.entity_type === 'budget');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView ref={scrollViewRef} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isSyncing} onRefresh={() => { void syncNow().catch(() => undefined); }} />}>
        <View style={styles.accountRow}>
          <View style={styles.accountIdentity}>
            <Text style={styles.eyebrow}>SMART EXPENSE AI</Text>
            <Text style={styles.accountName}>{user?.displayName}</Text>
            <Text style={styles.accountEmail}>{user?.email}</Text>
          </View>
          <Pressable
            disabled={isAuthSubmitting || busy}
            onPress={() => void logout()}
            style={styles.logoutButton}
          >
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </Pressable>
        </View>

        <WorkspaceNav active="budgets" />

        <View style={styles.heading}>
          <Text style={styles.title}>Presupuestos</Text>
          <Text style={styles.subtitle}>
            Define límites mensuales y sigue cómo avanza tu gasto.
          </Text>
        </View>

        <ConnectionStatus refreshing={progress.isRefreshing} onRefresh={() => { void progress.refresh().catch(() => undefined); }} />
        {syncError ? <Text style={styles.error}>{syncError}</Text> : null}

        {budgetConflicts.length > 0 ? (
          <View style={styles.conflictSection}>
            <Text style={styles.sectionTitle}>Conflictos de presupuestos</Text>
            {budgetConflicts.map((conflict) => (
              <View key={conflict.id} style={styles.conflictCard}>
                <Text style={styles.cardTitle}>{conflict.reason}</Text>
                <Text style={styles.muted} numberOfLines={1}>{conflict.entity_id}</Text>
                <View style={styles.actions}>
                  <Pressable
                    disabled={isResolving}
                    onPress={() =>
                      void resolveWithServer(conflict.id)
                        .then(() => syncNow())
                        .then(reloadConflicts)
                        .catch(() => undefined)
                    }
                    style={styles.secondaryButton}
                  >
                    <Text style={styles.secondaryText}>Usar servidor</Text>
                  </Pressable>
                  {conflict.reason === 'stale_version' && conflict.local_payload_json ? (
                    <Pressable
                      disabled={isResolving}
                      onPress={() =>
                        void retryMine(conflict.id)
                          .then(() => syncNow())
                          .then(reloadConflicts)
                          .catch(() => undefined)
                      }
                      style={styles.primaryButton}
                    >
                      <Text style={styles.primaryButtonText}>Reintentar mis cambios</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
            {conflictError ? <Text style={styles.error}>{conflictError}</Text> : null}
          </View>
        ) : null}

        <View
          style={[styles.formCard, formHighlighted && styles.formCardHighlighted]}
          onLayout={(event) => {
            formYRef.current = event.nativeEvent.layout.y;
            if (pendingRevealRef.current) revealForm();
          }}
        >
          <Text style={styles.sectionTitle}>{editingId ? 'Editar presupuesto' : 'Nuevo presupuesto'}</Text>
          <TextInput
            accessibilityLabel="Budget month"
            editable={!editingId}
            maxLength={7}
            onChangeText={setMonth}
            placeholder="YYYY-MM"
            style={[styles.input, editingId && styles.inputDisabled]}
            value={month}
          />

          {!editingId ? (
            <>
              <Text style={styles.fieldLabel}>Ámbito: {categoryName}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeRow}>
                <Pressable
                  onPress={() => setCategoryId(null)}
                  style={[styles.scopeButton, categoryId === null && styles.scopeButtonActive]}
                >
                  <Text style={styles.scopeText}>General</Text>
                </Pressable>
                {expenseCategories.map((category) => (
                  <Pressable
                    key={category.id}
                    onPress={() => setCategoryId(category.id)}
                    style={[styles.scopeButton, categoryId === category.id && styles.scopeButtonActive]}
                  >
                    <Text style={styles.scopeText}>{category.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          <TextInput
            ref={limitInputRef}
            accessibilityLabel="Budget limit"
            keyboardType="decimal-pad"
            onChangeText={setLimitAmount}
            onFocus={() => setLimitAmount((current) => canonicalMoneyInput(current))}
            onBlur={() => { if (limitAmount.trim()) setLimitAmount(formatMoneyInput(limitAmount)); }}
            placeholder="Límite (ej. 400,00 €)"
            style={styles.input}
            value={limitAmount}
          />
          <ActionPressable haptic="success" disabled={busy} onPress={() => void submit()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>
              {isSaving ? 'Guardando…' : editingId ? 'Guardar límite' : 'Crear presupuesto'}
            </Text>
          </ActionPressable>
          {editingId ? (
            <Pressable onPress={resetForm} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Cancelar</Text>
            </Pressable>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Presupuestos for {month}</Text>
          {isLoading ? <View style={{ width: 150 }}><CardSkeleton /></View> : null}
        </View>

        {budgets.length === 0 && !isLoading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.empty}>No hay presupuestos para este mes. Crea uno para marcar un objetivo de gasto.</Text>
            <ActionPressable haptic="selection" style={styles.primaryButton} onPress={revealForm}>
              <Text style={styles.primaryButtonText}>Crear primer presupuesto</Text>
            </ActionPressable>
          </View>
        ) : null}

        <DataFreshness cachedAt={progress.cachedAt} isCachedFallback={progress.isCachedFallback} />
        {progress.error ? <Text style={styles.error}>{progress.error}</Text> : null}
        {budgets.map((budget) => {
          const serverPresupuestos = progress.data?.month === month
            ? [progress.data.totalBudget, ...progress.data.categoryPresupuestos] : [];
          const spending = serverPresupuestos.find((item) => item?.id === budget.id);
          const label = budget.category_name ?? 'General monthly budget';
          return (
            <View key={budget.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIdentity}>
                  <Text style={styles.cardTitle}>{label}</Text>
                  <Text style={styles.muted}>
                    {STATUS_LABEL[budget.sync_status]}
                    {budget.category_archived ? ' · categoría archivada' : ''}
                  </Text>
                </View>
                <Text style={styles.amount}>{minorUnitsToDecimal(budget.limit_minor)} €</Text>
              </View>
              {spending && budget.sync_status === 'synced' ? <View>
                <Text style={styles.muted}>Gastado: {spending.spentAmount} € · Restante: {spending.remainingAmount} €</Text>
                <Text style={[styles.muted, spending.overBudget && styles.error]}>
                  {spending.percentUsed}% usado · {spending.daysRemaining} días restantes
                </Text>
              </View> : null}
              <View style={styles.actions}>
                <Pressable
                  disabled={busy || budget.sync_status === 'conflict'}
                  onPress={() => {
                    setEditingId(budget.id);
                    setCategoryId(budget.category_id);
                    setLimitAmount(minorUnitsToDecimal(budget.limit_minor));
                    revealForm();
                  }}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryText}>Editar límite</Text>
                </Pressable>
                <Pressable
                  disabled={busy || budget.sync_status === 'conflict'}
                  onPress={() => requestEliminar(budget.id, `${label} · ${minorUnitsToDecimal(budget.limit_minor)} €`)}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.deleteText}>Eliminar</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <Snackbar message={toast} onDismiss={() => setToast(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f6f7f9' },
  content: { gap: 14, padding: 20, paddingBottom: 40 },
  accountRow: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  accountIdentity: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  accountName: { fontSize: 16, fontWeight: '700' },
  accountEmail: { fontSize: 12, opacity: 0.6 },
  logoutButton: { borderColor: '#c9ced6', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  logoutText: { fontSize: 13, fontWeight: '700' },
  heading: { gap: 5 },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 15, lineHeight: 22, opacity: 0.7 },
  syncPanel: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, flexDirection: 'row', gap: 12, justifyContent: 'space-between', padding: 14 },
  syncSummary: { flex: 1, gap: 3 },
  syncTitle: { fontSize: 15, fontWeight: '800' },
  syncMeta: { fontSize: 12, opacity: 0.65 },
  conflictSection: { gap: 8 },
  conflictCard: { backgroundColor: '#fff7ed', borderRadius: 12, gap: 7, padding: 12 },
  formCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: 'transparent', gap: 10, padding: 14 },
  formCardHighlighted: { borderColor: '#22a27c', shadowColor: '#22a27c', shadowOpacity: 0.18, shadowRadius: 10, elevation: 2 },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  input: { borderColor: '#d9dde3', borderRadius: 11, borderWidth: 1, fontSize: 16, paddingHorizontal: 13, paddingVertical: 12 },
  inputDisabled: { opacity: 0.55 },
  scopeRow: { gap: 7, paddingVertical: 2 },
  scopeButton: { borderColor: '#c9ced6', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  scopeButtonActive: { backgroundColor: '#e8ebef' },
  scopeText: { fontSize: 12, fontWeight: '700' },
  primaryButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondaryButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderColor: '#c9ced6', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryText: { fontSize: 13, fontWeight: '700' },
  deleteText: { color: '#b42318', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  error: { color: '#b42318', fontSize: 13 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 14, gap: 10, padding: 14 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardIdentity: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  muted: { fontSize: 12, opacity: 0.62 },
  amount: { fontSize: 17, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empty: { fontSize: 14, lineHeight: 21, opacity: 0.65 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 14, gap: 12, alignItems: 'flex-start', padding: 16 },
});
