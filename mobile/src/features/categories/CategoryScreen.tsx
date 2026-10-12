import { useRef, useState } from 'react';
import type { ScrollView as NativeScrollView, TextInput as NativeTextInput } from 'react-native';
import {
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
 SafeAreaView } from '../../ui/primitives';

import { useAuth } from '../../auth/AuthProvider';
import { WorkspaceNav } from '../../components/WorkspaceNav';
import { ConnectionStatus } from '../../components/ConnectionStatus';
import { useConflicts } from '../../sync/useConflicts';
import { useForegroundSync } from '../../sync/useForegroundSync';
import type { CategoryTransactionType } from './offlineCategoryMutations';
import { useCategories } from './useCategories';
import { useSnackbar } from '../../ui/Snackbar';
import { CardSkeleton } from '../../ui/Skeleton';
import { ActionPressable } from '../../ui/ActionPressable';

const STATUS_LABEL = {
  synced: 'Sincronizada',
  pending: 'Pendiente',
  failed: 'Revisar',
  conflict: 'Conflicto',
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
  const [formHighlighted, setFormHighlighted] = useState(false);
  const { showSnackbar } = useSnackbar();
  const scrollViewRef = useRef<NativeScrollView>(null);
  const formYRef = useRef<number | null>(null);
  const nameInputRef = useRef<NativeTextInput>(null);

  const revealForm = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (formYRef.current === null) return;
      scrollViewRef.current?.scrollTo({ y: Math.max(0, formYRef.current - 12), animated: true });
      setFormHighlighted(true);
      setTimeout(() => setFormHighlighted(false), 900);
      setTimeout(() => nameInputRef.current?.focus(), 260);
    }));
  };

  const resetForm = () => {
    setName('');
    setEditingId(null);
  };

  const submit = async () => {
    try {
      const wasEditing = editingId !== null;
      if (editingId) {
        await rename(editingId, name);
      } else {
        await create(name, transactionType);
      }
      resetForm();
      showSnackbar(wasEditing ? 'Categoría renombrada' : 'Categoría creada');
      await refreshHealth();
      void syncNow().then(reloadConflicts).catch(() => undefined);
    } catch {
      // Hook state renders the validation or persistence error.
    }
  };

  const busy = isSaving || isResolving;
  const categoryConflicts = conflicts.filter((conflict) => conflict.entity_type === 'category');

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

        <WorkspaceNav active="categories" />

        <View style={styles.heading}>
          <Text style={styles.title}>Categorías</Text>
          <Text style={styles.subtitle}>
            Organiza tus ingresos y gastos. Crea, renombra o archiva tus propias categorías.
          </Text>
        </View>

        <ConnectionStatus onRefresh={() => { void syncNow().then(reloadConflicts).catch(() => undefined); }} />
        {syncError ? <Text style={styles.error}>{syncError}</Text> : null}

        {categoryConflicts.length > 0 ? (
          <View style={styles.conflictSection}>
            <Text style={styles.sectionTitle}>Conflictos de categorías</Text>
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
          onLayout={(event) => { formYRef.current = event.nativeEvent.layout.y; }}
        >
          <Text style={styles.sectionTitle}>{editingId ? 'Renombrar categoría' : 'Nueva categoría'}</Text>
          <TextInput
            ref={nameInputRef}
            accessibilityLabel="Category name"
            maxLength={80}
            onChangeText={setName}
            placeholder="Nombre de categoría"
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
                  <Text style={styles.typeLabel}>{type === 'expense' ? 'Gasto' : 'Ingreso'}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <ActionPressable haptic="success" disabled={busy} onPress={() => void submit()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>
              {isSaving ? 'Guardando…' : editingId ? 'Guardar nombre' : 'Crear categoría'}
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
          <Text style={styles.sectionTitle}>Tus categorías</Text>
          {isLoading ? <View style={{ width: 170 }}><CardSkeleton /></View> : null}
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
                    {category.transaction_type} · {isSystem ? 'sistema' : 'personal'} ·{' '}
                    {STATUS_LABEL[category.sync_status]}
                  </Text>
                </View>
                {isArchived ? <Text style={styles.archivedBadge}>Archivada</Text> : null}
              </View>
              <Text style={styles.muted}>{category.transaction_count} movimientos locales</Text>

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
                          revealForm();
                        }}
                        style={styles.secondaryButton}
                      >
                        <Text style={styles.secondaryText}>Renombrar</Text>
                      </Pressable>
                      <Pressable
                        disabled={busy || category.transaction_count > 0 || category.sync_status === 'conflict'}
                        onPress={() =>
                          void setArchived(category.id, true)
                            .then(() => showSnackbar('Categoría archivada'))
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
                        <Text style={styles.secondaryText}>Archivar</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      disabled={busy || category.sync_status === 'conflict'}
                      onPress={() =>
                        void setArchived(category.id, false)
                          .then(() => showSnackbar('Categoría restaurada'))
                          .then(refreshHealth)
                          .then(() => syncNow())
                          .then(reloadConflicts)
                          .catch(() => undefined)
                      }
                      style={styles.secondaryButton}
                    >
                      <Text style={styles.secondaryText}>Restaurar</Text>
                    </Pressable>
                  )}
                </View>
              ) : (
                <Text style={styles.readOnly}>Categoría incluida</Text>
              )}
              {!isArchived && !isSystem && category.transaction_count > 0 ? (
                <Text style={styles.warning}>Reasigna los movimientos antes de archivar.</Text>
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
  formCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: 'transparent', gap: 10, padding: 14 },
  formCardHighlighted: { borderColor: '#22a27c', shadowColor: '#22a27c', shadowOpacity: 0.18, shadowRadius: 10, elevation: 2 },
  input: { borderColor: '#d9dde3', borderRadius: 11, borderWidth: 1, fontSize: 16, paddingHorizontal: 13, paddingVertical: 12 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeButton: { borderColor: '#c9ced6', borderRadius: 10, borderWidth: 1, flex: 1, padding: 10 },
  typeButtonActive: { backgroundColor: '#e8ebef' },
  typeLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  primaryButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondaryButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderColor: '#c9ced6', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
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
