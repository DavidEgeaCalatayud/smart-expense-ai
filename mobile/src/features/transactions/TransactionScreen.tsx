import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { WorkspaceNav } from '../../components/WorkspaceNav';
import type { LocalTransactionRow } from '../../database/types';
import { useConflicts } from '../../sync/useConflicts';
import { useForegroundSync } from '../../sync/useForegroundSync';
import { useTransactions } from './useTransactions';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_LABEL = {
  synced: 'Synced',
  pending: 'Pending sync',
  failed: 'Needs attention',
  conflict: 'Conflict',
} as const;

function TransactionItem({
  item,
  disabled,
  onEdit,
  onDelete,
}: {
  item: LocalTransactionRow;
  disabled: boolean;
  onEdit(item: LocalTransactionRow): void;
  onDelete(item: LocalTransactionRow): void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.merchant}>{item.merchant}</Text>
        <Text style={styles.amount}>{minorUnitsToDecimal(item.amount_minor)} €</Text>
      </View>
      <Text style={styles.metadata}>
        {item.category_name} · {item.transaction_date}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.syncState}>{STATUS_LABEL[item.sync_status]}</Text>
        <View style={styles.cardActions}>
          <Pressable disabled={disabled} onPress={() => onEdit(item)}>
            <Text style={styles.actionText}>Edit</Text>
          </Pressable>
          <Pressable disabled={disabled} onPress={() => onDelete(item)}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function TransactionScreen() {
  const { user, logout, isSubmitting: isAuthSubmitting } = useAuth();
  const { transactions, isLoading, isSaving, error, reload, create, update, remove } =
    useTransactions();
  const {
    isSyncing,
    health,
    lastResult,
    error: syncError,
    syncNow,
    refreshHealth,
  } = useForegroundSync(reload);
  const {
    conflicts,
    isResolving,
    error: conflictError,
    reload: reloadConflicts,
    resolveWithServer,
    retryMine,
  } = useConflicts(async () => {
    await reload();
    await refreshHealth();
  });

  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryName, setCategoryName] = useState('General');
  const [transactionDate, setTransactionDate] = useState(todayIsoDate());
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setMerchant('');
    setAmount('');
    setCategoryName('General');
    setTransactionDate(todayIsoDate());
  };

  const submit = async () => {
    try {
      if (editingId) {
        await update(editingId, { merchant, amount, transactionDate });
      } else {
        await create({ merchant, amount, categoryName, transactionDate });
      }
      resetForm();
      await refreshHealth();
      void syncNow().then(reloadConflicts).catch(() => {
        // The transaction remains durable and pending while offline.
      });
    } catch {
      // Error state is owned by the hooks and rendered below.
    }
  };

  const beginEdit = (item: LocalTransactionRow) => {
    if (item.sync_status === 'conflict') {
      return;
    }
    setEditingId(item.id);
    setMerchant(item.merchant);
    setAmount(minorUnitsToDecimal(item.amount_minor));
    setCategoryName(item.category_name);
    setTransactionDate(item.transaction_date);
  };

  const requestDelete = (item: LocalTransactionRow) => {
    Alert.alert('Delete transaction?', `${item.merchant} · ${minorUnitsToDecimal(item.amount_minor)} €`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await remove(item.id);
              if (editingId === item.id) {
                resetForm();
              }
              await refreshHealth();
              void syncNow().then(reloadConflicts).catch(() => {
                // Offline delete intent remains durable in the outbox.
              });
            } catch {
              // Hook state renders the error.
            }
          })();
        },
      },
    ]);
  };

  const busy = isSaving || isSyncing || isResolving;
  const issueCount = health.failed + health.conflicts;

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TransactionItem
            item={item}
            disabled={busy}
            onEdit={beginEdit}
            onDelete={requestDelete}
          />
        )}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.accountRow}>
              <View style={styles.accountIdentity}>
                <Text style={styles.eyebrow}>SMART EXPENSE AI · MOBILE</Text>
                <Text style={styles.accountName}>{user?.displayName}</Text>
                <Text style={styles.accountEmail}>{user?.email}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={isAuthSubmitting || busy}
                onPress={() => void logout()}
                style={({ pressed }) => [
                  styles.logoutButton,
                  pressed && styles.buttonPressed,
                  (isAuthSubmitting || busy) && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.logoutText}>Sign out</Text>
              </Pressable>
            </View>

            <WorkspaceNav active="transactions" />

            <Text style={styles.title}>Offline-first transactions</Text>
            <Text style={styles.subtitle}>
              SQLite is the local workspace. Foreground sync pushes durable local intent and pulls
              the authoritative FastAPI/PostgreSQL state without reimplementing financial rules.
            </Text>

            <View style={styles.syncPanel}>
              <View style={styles.syncSummary}>
                <Text style={styles.syncTitle}>{isSyncing ? 'Synchronizing…' : 'Synchronization'}</Text>
                <Text style={styles.syncMeta}>
                  {health.queued} queued · {health.failed} failed · {health.conflicts} conflicts
                </Text>
                {lastResult ? (
                  <Text style={styles.syncMeta}>
                    Last run: {lastResult.pushedMutations} pushed ·{' '}
                    {lastResult.bootstrapChanges + lastResult.pulledChanges} received
                  </Text>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void syncNow().then(reloadConflicts).catch(() => undefined)}
                style={({ pressed }) => [
                  styles.syncButton,
                  pressed && styles.buttonPressed,
                  busy && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.syncButtonText}>Sync now</Text>
              </Pressable>
            </View>
            {syncError ? <Text style={styles.error}>{syncError}</Text> : null}

            {conflicts.length > 0 ? (
              <View style={styles.conflictSection}>
                <Text style={styles.conflictTitle}>Conflicts need a decision</Text>
                {conflicts.map((conflict) => (
                  <View key={conflict.id} style={styles.conflictCard}>
                    <Text style={styles.conflictEntity}>
                      {conflict.entity_type} · {conflict.reason}
                    </Text>
                    <Text style={styles.conflictHint} numberOfLines={1}>
                      {conflict.entity_id}
                    </Text>
                    <View style={styles.conflictActions}>
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
                        <Text style={styles.secondaryButtonText}>Use server</Text>
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
                          style={styles.button}
                        >
                          <Text style={styles.buttonText}>Retry mine</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ))}
                {conflictError ? <Text style={styles.error}>{conflictError}</Text> : null}
              </View>
            ) : null}

            <View style={styles.form}>
              <Text style={styles.formTitle}>
                {editingId ? 'Edit local transaction' : 'New transaction'}
              </Text>
              <TextInput
                accessibilityLabel="Merchant"
                placeholder="Merchant"
                value={merchant}
                onChangeText={setMerchant}
                style={styles.input}
                maxLength={120}
              />
              <TextInput
                accessibilityLabel="Amount"
                placeholder="Amount (e.g. 21,35)"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <TextInput
                accessibilityLabel="Category"
                editable={!editingId}
                placeholder="Category"
                value={categoryName}
                onChangeText={setCategoryName}
                style={[styles.input, editingId ? styles.inputDisabled : null]}
                maxLength={80}
              />
              <TextInput
                accessibilityLabel="Transaction date"
                placeholder="YYYY-MM-DD"
                value={transactionDate}
                onChangeText={setTransactionDate}
                style={styles.input}
                maxLength={10}
              />
              <Pressable
                accessibilityRole="button"
                disabled={isSaving || isResolving}
                onPress={() => void submit()}
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  (isSaving || isResolving) && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.buttonText}>
                  {isSaving ? 'Saving…' : editingId ? 'Save offline edit' : 'Save offline'}
                </Text>
              </Pressable>
              {editingId ? (
                <Pressable accessibilityRole="button" onPress={resetForm} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Cancel edit</Text>
                </Pressable>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Stored on this device</Text>
              {isLoading ? <ActivityIndicator /> : issueCount > 0 ? (
                <Text style={styles.issueCount}>{issueCount} need attention</Text>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : (
            <Text style={styles.empty}>
              No local transactions yet. Synced web transactions will appear here after a pull.
            </Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f6f7f9' },
  content: { padding: 20, gap: 12 },
  header: { gap: 14 },
  accountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  accountIdentity: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  accountName: { fontSize: 16, fontWeight: '700' },
  accountEmail: { fontSize: 12, opacity: 0.6 },
  logoutButton: {
    borderColor: '#c9ced6',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  logoutText: { fontSize: 13, fontWeight: '700' },
  title: { fontSize: 32, fontWeight: '800' },
  subtitle: { fontSize: 15, lineHeight: 22, opacity: 0.7 },
  syncPanel: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 14,
  },
  syncSummary: { flex: 1, gap: 3 },
  syncTitle: { fontSize: 15, fontWeight: '800' },
  syncMeta: { fontSize: 12, opacity: 0.65 },
  syncButton: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  syncButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  conflictSection: { gap: 8 },
  conflictTitle: { fontSize: 16, fontWeight: '800' },
  conflictCard: { backgroundColor: '#fff7ed', borderRadius: 12, gap: 6, padding: 12 },
  conflictEntity: { fontSize: 13, fontWeight: '800' },
  conflictHint: { fontSize: 11, opacity: 0.6 },
  conflictActions: { flexDirection: 'row', gap: 8 },
  form: { gap: 10, marginTop: 4 },
  formTitle: { fontSize: 16, fontWeight: '800' },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d9dde3',
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  inputDisabled: { opacity: 0.55 },
  button: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#c9ced6',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  error: { color: '#b42318', fontSize: 14 },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  sectionTitle: { fontSize: 19, fontWeight: '700' },
  issueCount: { fontSize: 12, fontWeight: '700', opacity: 0.65 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    gap: 5,
    padding: 16,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  merchant: { flex: 1, fontSize: 17, fontWeight: '700' },
  amount: { fontSize: 17, fontWeight: '800' },
  metadata: { fontSize: 13, opacity: 0.65 },
  cardFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  syncState: { fontSize: 12, fontWeight: '700', opacity: 0.6 },
  cardActions: { flexDirection: 'row', gap: 14 },
  actionText: { fontSize: 12, fontWeight: '700' },
  deleteText: { color: '#b42318', fontSize: 12, fontWeight: '700' },
  empty: { fontSize: 14, lineHeight: 21, opacity: 0.65, paddingVertical: 12 },
});
