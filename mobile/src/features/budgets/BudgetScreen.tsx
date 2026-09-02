import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthProvider';
import { WorkspaceNav } from '../../components/WorkspaceNav';
import { useConflicts } from '../../sync/useConflicts';
import { useForegroundSync } from '../../sync/useForegroundSync';
import { useBudgets } from './useBudgets';

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
  } = useBudgets(month);
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
    health,
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

  const categoryName = useMemo(() => {
    if (categoryId === null) {
      return 'Overall monthly budget';
    }
    return expenseCategories.find((category) => category.id === categoryId)?.name ?? 'Category';
  }, [categoryId, expenseCategories]);

  const resetForm = () => {
    setEditingId(null);
    setLimitAmount('');
    setCategoryId(null);
  };

  const submit = async () => {
    try {
      if (editingId) {
        await update(editingId, limitAmount);
      } else {
        await create(categoryId, limitAmount);
      }
      resetForm();
      await refreshHealth();
      void syncNow().then(reloadConflicts).catch(() => undefined);
    } catch {
      // Hook state owns user-visible validation/persistence errors.
    }
  };

  const requestDelete = (budgetId: string, label: string) => {
    Alert.alert('Delete budget?', label, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void remove(budgetId)
            .then(refreshHealth)
            .then(() => syncNow())
            .then(reloadConflicts)
            .catch(() => undefined);
        },
      },
    ]);
  };

  const busy = isSaving || isSyncing || isResolving;
  const budgetConflicts = conflicts.filter((conflict) => conflict.entity_type === 'budget');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.accountRow}>
          <View style={styles.accountIdentity}>
            <Text style={styles.eyebrow}>SMART EXPENSE AI · MOBILE</Text>
            <Text style={styles.accountName}>{user?.displayName}</Text>
            <Text style={styles.accountEmail}>{user?.email}</Text>
          </View>
          <Pressable
            disabled={isAuthSubmitting || busy}
            onPress={() => void logout()}
            style={styles.logoutButton}
          >
            <Text style={styles.logoutText}>Sign out</Text>
          </Pressable>
        </View>

        <WorkspaceNav active="budgets" />

        <View style={styles.heading}>
          <Text style={styles.title}>Budgets</Text>
          <Text style={styles.subtitle}>
            Budget definitions are editable offline using exact integer minor units. Spending progress
            remains a server-derived calculation and is not reimplemented here.
          </Text>
        </View>

        <View style={styles.syncPanel}>
          <View style={styles.syncSummary}>
            <Text style={styles.syncTitle}>{isSyncing ? 'Synchronizing…' : 'Synchronization'}</Text>
            <Text style={styles.syncMeta}>
              {health.queued} queued · {health.failed} failed · {health.conflicts} conflicts
            </Text>
          </View>
          <Pressable
            disabled={busy}
            onPress={() => void syncNow().then(reloadConflicts).catch(() => undefined)}
            style={[styles.primaryButton, busy && styles.disabled]}
          >
            <Text style={styles.primaryButtonText}>Sync now</Text>
          </Pressable>
        </View>
        {syncError ? <Text style={styles.error}>{syncError}</Text> : null}

        {budgetConflicts.length > 0 ? (
          <View style={styles.conflictSection}>
            <Text style={styles.sectionTitle}>Budget conflicts</Text>
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
                    <Text style={styles.secondaryText}>Use server</Text>
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
                      <Text style={styles.primaryButtonText}>Retry mine</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
            {conflictError ? <Text style={styles.error}>{conflictError}</Text> : null}
          </View>
        ) : null}

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>{editingId ? 'Edit budget limit' : 'New budget'}</Text>
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
              <Text style={styles.fieldLabel}>Scope: {categoryName}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeRow}>
                <Pressable
                  onPress={() => setCategoryId(null)}
                  style={[styles.scopeButton, categoryId === null && styles.scopeButtonActive]}
                >
                  <Text style={styles.scopeText}>Overall</Text>
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
            accessibilityLabel="Budget limit"
            keyboardType="decimal-pad"
            onChangeText={setLimitAmount}
            placeholder="Limit (e.g. 400,00)"
            style={styles.input}
            value={limitAmount}
          />
          <Pressable disabled={busy} onPress={() => void submit()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>
              {isSaving ? 'Saving…' : editingId ? 'Save limit' : 'Create offline'}
            </Text>
          </Pressable>
          {editingId ? (
            <Pressable onPress={resetForm} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Budgets for {month}</Text>
          {isLoading ? <ActivityIndicator /> : null}
        </View>

        {budgets.length === 0 && !isLoading ? (
          <Text style={styles.empty}>No local budget definitions for this month.</Text>
        ) : null}

        {budgets.map((budget) => {
          const label = budget.category_name ?? 'Overall monthly budget';
          return (
            <View key={budget.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIdentity}>
                  <Text style={styles.cardTitle}>{label}</Text>
                  <Text style={styles.muted}>
                    {STATUS_LABEL[budget.sync_status]}
                    {budget.category_archived ? ' · category archived' : ''}
                  </Text>
                </View>
                <Text style={styles.amount}>{minorUnitsToDecimal(budget.limit_minor)} €</Text>
              </View>
              <View style={styles.actions}>
                <Pressable
                  disabled={busy || budget.sync_status === 'conflict'}
                  onPress={() => {
                    setEditingId(budget.id);
                    setCategoryId(budget.category_id);
                    setLimitAmount(minorUnitsToDecimal(budget.limit_minor));
                  }}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryText}>Edit limit</Text>
                </Pressable>
                <Pressable
                  disabled={busy || budget.sync_status === 'conflict'}
                  onPress={() => requestDelete(budget.id, `${label} · ${minorUnitsToDecimal(budget.limit_minor)} €`)}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
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
  formCard: { backgroundColor: '#fff', borderRadius: 14, gap: 10, padding: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  input: { borderColor: '#d9dde3', borderRadius: 11, borderWidth: 1, fontSize: 16, paddingHorizontal: 13, paddingVertical: 12 },
  inputDisabled: { opacity: 0.55 },
  scopeRow: { gap: 7, paddingVertical: 2 },
  scopeButton: { borderColor: '#c9ced6', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  scopeButtonActive: { backgroundColor: '#e8ebef' },
  scopeText: { fontSize: 12, fontWeight: '700' },
  primaryButton: { alignItems: 'center', backgroundColor: '#111827', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderColor: '#c9ced6', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
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
});
