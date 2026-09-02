import { useState } from 'react';
import {
  ActivityIndicator,
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
import type { CategoryTransactionType } from './offlineCategoryMutations';
import { useCategories } from './useCategories';

const STATUS_LABEL = {
  synced: 'Synced',
  pending: 'Pending sync',
  failed: 'Needs attention',
  conflict: 'Conflict',
} as const;

export function CategoryScreen() {
  const { user, logout, isSubmitting: isAuthSubmitting } = useAuth();
  const { categories, isLoading, isSaving, error, reload, create, rename, setArchived } =
    useCategories();
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

  const [name, setName] = useState('');
  const [transactionType, setTransactionType] = useState<CategoryTransactionType>('expense');
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setEditingId(null);
  };

  const submit = async () => {
    try {
      if (editingId) {
        await rename(editingId, name);
      } else {
        await create(name, transactionType);
      }
      resetForm();
      await refreshHealth();
      void syncNow().then(reloadConflicts).catch(() => undefined);
    } catch {
      // Hook state renders the validation or persistence error.
    }
  };

  const busy = isSaving || isSyncing || isResolving;
  const categoryConflicts = conflicts.filter((conflict) => conflict.entity_type === 'category');

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

        <WorkspaceNav active="categories" />

        <View style={styles.heading}>
          <Text style={styles.title}>Categories</Text>
          <Text style={styles.subtitle}>
            System categories are replicated read-only. Your own categories can be created, renamed,
            archived and restored offline.
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

        {categoryConflicts.length > 0 ? (
          <View style={styles.conflictSection}>
            <Text style={styles.sectionTitle}>Category conflicts</Text>
            {categoryConflicts.map((conflict) => (
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
          <Text style={styles.sectionTitle}>{editingId ? 'Rename category' : 'New category'}</Text>
          <TextInput
            accessibilityLabel="Category name"
            maxLength={80}
            onChangeText={setName}
            placeholder="Category name"
            style={styles.input}
            value={name}
          />
          {!editingId ? (
            <View style={styles.typeRow}>
              {(['expense', 'income'] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => setTransactionType(type)}
                  style={[
                    styles.typeButton,
                    transactionType === type && styles.typeButtonActive,
                  ]}
                >
                  <Text style={styles.typeLabel}>{type === 'expense' ? 'Expense' : 'Income'}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Pressable disabled={busy} onPress={() => void submit()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>
              {isSaving ? 'Saving…' : editingId ? 'Save rename' : 'Create offline'}
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
          <Text style={styles.sectionTitle}>Replicated categories</Text>
          {isLoading ? <ActivityIndicator /> : null}
        </View>

        {categories.map((category) => {
          const isSystem = category.system_category === 1;
          const isArchived = category.archived === 1;
          return (
            <View key={category.id} style={[styles.card, isArchived && styles.archivedCard]}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIdentity}>
                  <Text style={styles.cardTitle}>{category.name}</Text>
                  <Text style={styles.muted}>
                    {category.transaction_type} · {isSystem ? 'system' : 'personal'} ·{' '}
                    {STATUS_LABEL[category.sync_status]}
                  </Text>
                </View>
                {isArchived ? <Text style={styles.archivedBadge}>Archived</Text> : null}
              </View>
              <Text style={styles.muted}>{category.transaction_count} local transactions</Text>

              {!isSystem ? (
                <View style={styles.actions}>
                  {!isArchived ? (
                    <>
                      <Pressable
                        disabled={busy || category.sync_status === 'conflict'}
                        onPress={() => {
                          setEditingId(category.id);
                          setName(category.name);
                          setTransactionType(category.transaction_type);
                        }}
                        style={styles.secondaryButton}
                      >
                        <Text style={styles.secondaryText}>Rename</Text>
                      </Pressable>
                      <Pressable
                        disabled={busy || category.transaction_count > 0 || category.sync_status === 'conflict'}
                        onPress={() =>
                          void setArchived(category.id, true)
                            .then(refreshHealth)
                            .then(() => syncNow())
                            .then(reloadConflicts)
                            .catch(() => undefined)
                        }
                        style={[
                          styles.secondaryButton,
                          category.transaction_count > 0 && styles.disabled,
                        ]}
                      >
                        <Text style={styles.secondaryText}>Archive</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      disabled={busy || category.sync_status === 'conflict'}
                      onPress={() =>
                        void setArchived(category.id, false)
                          .then(refreshHealth)
                          .then(() => syncNow())
                          .then(reloadConflicts)
                          .catch(() => undefined)
                      }
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryText}>Restore</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <Text style={styles.readOnly}>Read-only server category</Text>
              )}
              {!isArchived && !isSystem && category.transaction_count > 0 ? (
                <Text style={styles.warning}>Reassign transactions before archiving.</Text>
              ) : null}
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
  formCard: { backgroundColor: '#fff', borderRadius: 14, gap: 10, padding: 14 },
  input: { borderColor: '#d9dde3', borderRadius: 11, borderWidth: 1, fontSize: 16, paddingHorizontal: 13, paddingVertical: 12 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeButton: { borderColor: '#c9ced6', borderRadius: 10, borderWidth: 1, flex: 1, padding: 10 },
  typeButtonActive: { backgroundColor: '#e8ebef' },
  typeLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  primaryButton: { alignItems: 'center', backgroundColor: '#111827', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderColor: '#c9ced6', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryText: { fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  error: { color: '#b42318', fontSize: 13 },
  warning: { color: '#92400e', fontSize: 12 },
  readOnly: { fontSize: 12, fontWeight: '700', opacity: 0.55 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 14, gap: 8, padding: 14 },
  archivedCard: { opacity: 0.7 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardIdentity: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  muted: { fontSize: 12, opacity: 0.62 },
  archivedBadge: { fontSize: 11, fontWeight: '800', opacity: 0.65 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  conflictSection: { gap: 8 },
  conflictCard: { backgroundColor: '#fff7ed', borderRadius: 12, gap: 7, padding: 12 },
});
