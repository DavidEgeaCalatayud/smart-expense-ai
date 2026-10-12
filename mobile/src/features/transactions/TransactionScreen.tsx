import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View , SafeAreaView } from '../../ui/primitives';
import { ConnectionStatus } from '../../components/ConnectionStatus';
import { serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';
import type { LocalCategoryRow, LocalTransactionRow } from '../../database/types';
import { SqliteCategoryRepository } from '../../repositories/categoryRepository';
import type { TransactionFilters as Filters } from '../../repositories/transactionRepository';
import { useConflicts } from '../../sync/useConflicts';
import { useForegroundSync } from '../../sync/useForegroundSync';
import { TransactionEditor } from './TransactionEditor';
import { Snackbar } from '../../ui/Snackbar';
import { CardSkeleton } from '../../ui/Skeleton';
import { ActionPressable } from '../../ui/ActionPressable';
import { TransactionFilters } from './TransactionFilters';
import { useTransactions } from './useTransactions';
import type { OfflineTransactionFormInput } from './validation';

const STATUS_LABEL = { synced: 'Synced', pending: 'Pending sync', failed: 'Needs attention', conflict: 'Conflict' } as const;
export function TransactionScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { quickAdd } = useLocalSearchParams<{ quickAdd?: string }>();
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<LocalTransactionRow | null>(null);
  const [initialType, setInitialType] = useState<'expense' | 'income'>('expense');
  const [categories, setCategories] = useState<LocalCategoryRow[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { transactions, isLoading, isSaving, error, reload, create, update, remove } = useTransactions(filters, 51, page * 50);
  const reloadAll = useCallback(async () => {
    await reload();
    setCategories(await new SqliteCategoryRepository(db).listManaged());
  }, [db, reload]);
  const { isSyncing, syncNow, refreshHealth, revision, error: syncError } = useForegroundSync(reloadAll);
  const { conflicts, isResolving, error: conflictError, reload: reloadConflicts, resolveWithServer, retryMine } = useConflicts(async () => { await reloadAll(); await refreshHealth(); });
  useEffect(() => { void reloadConflicts().catch(() => undefined); }, [revision, reloadConflicts]);
  const linkType = quickAdd === 'expense' || quickAdd === 'income' ? quickAdd : null;
  const closeEditor = () => {
    setEditor(false);
    setEditing(null);
    if (linkType) router.replace('/transactions'); else router.setParams({ quickAdd: undefined });
  };
  const changeFilters = (value: Filters) => { setPage(0); setFilters(value); };
  const refresh = () => { void syncNow().then(reloadAll).then(reloadConflicts).catch(() => undefined); };
  const saved = async (input: OfflineTransactionFormInput) => {
    setActionError(null);
    const wasEditing = editing !== null;
    try {
      if (editing) await update(editing.id, input); else await create(input);
      closeEditor();
      setToast(wasEditing ? 'Movimiento actualizado' : 'Movimiento guardado');
      await refreshHealth();
      refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Unable to save transaction');
      throw caught;
    }
  };
  const requestDelete = (item: LocalTransactionRow) => Alert.alert('Delete transaction?', `${item.merchant} · ${minorUnitsToDecimal(item.amount_minor)} €`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { void remove(item.id).then(() => setToast('Movimiento eliminado')).then(refreshHealth).then(refresh).catch(() => undefined); } },
  ]);
  const busy = isSaving || isResolving;
  const activeFilters = Object.entries(filters).filter(([key, value]) => key !== 'search' && value !== undefined).length;
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
    <FlatList data={transactions.slice(0, 50)} keyExtractor={(item) => item.id} refreshing={isSyncing} onRefresh={refresh}
      keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={{ gap: 16 }}>
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
          <View><Text style={styles.title}>Actividad</Text><Text style={s.metadata}>Tus movimientos</Text></View>
          <Pressable accessibilityRole="button" onPress={() => { setInitialType('expense'); setEditing(null); setActionError(null); setEditor(true); }} style={s.primaryButton}>
            <Text style={s.primaryButtonText}>+ Añadir</Text>
          </Pressable>
        </View>
        <ConnectionStatus onRefresh={refresh} />
        <View style={s.row}><TextInput accessibilityLabel="Search transactions" placeholder="Buscar movimientos" value={filters.search ?? ''}
          onChangeText={(search) => changeFilters({ ...filters, search })} style={[s.input, { flex: 1 }]} autoCorrect={false} />
          <Pressable accessibilityRole="button" accessibilityLabel="Filters and sort" style={s.secondaryButton} onPress={() => setFilterOpen(true)}>
            <Text>Filtros{activeFilters ? ` (${activeFilters})` : ''}</Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Filter dates" onPress={() => setFilterOpen(true)} style={[s.secondaryButton, { alignSelf: 'flex-start' }]}>
          <Text>{filters.month ? new Date(`${filters.month}-15T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : filters.dateFrom || filters.dateTo ? 'Rango de fechas' : 'Todas las fechas'} ▾</Text>
        </Pressable>
        {activeFilters > 0 || filters.search ? <Pressable accessibilityRole="button" style={{ paddingVertical: 8 }} onPress={() => changeFilters({})}><Text style={styles.link}>Limpiar búsqueda y filtros</Text></Pressable> : null}
        {syncError ? <Text style={s.metadata}>{syncError}</Text> : null}
        {error && !editor ? <Text style={s.error}>{error}</Text> : null}
        {conflicts.length > 0 ? <View style={s.section}>
          <Text style={s.sectionTitle}>Conflictos pendientes</Text>
          {conflicts.map((conflict) => <View key={conflict.id} style={[s.card, { backgroundColor: '#fff7ed' }]}>
            <Text style={s.body}>Este elemento cambió en otro dispositivo.</Text>
            <View style={s.row}>
              <Pressable accessibilityRole="button" disabled={isResolving} style={s.secondaryButton}
                onPress={() => void resolveWithServer(conflict.id).then(syncNow).then(reloadConflicts).catch(() => undefined)}><Text>Usar servidor</Text></Pressable>
              {conflict.reason === 'stale_version' && conflict.local_payload_json ? <Pressable accessibilityRole="button" disabled={isResolving} style={s.primaryButton}
                onPress={() => void retryMine(conflict.id).then(syncNow).then(reloadConflicts).catch(() => undefined)}><Text style={s.primaryButtonText}>Reintentar mis cambios</Text></Pressable> : null}
            </View>
          </View>)}
          {conflictError ? <Text style={s.error}>{conflictError}</Text> : null}
        </View> : null}
        {isLoading ? <View style={{ gap: 10 }}><CardSkeleton /><CardSkeleton /></View> : null}
      </View>}
      renderItem={({ item }) => <View style={s.card}>
        <View style={s.row}><Text style={[s.cardTitle, { flex: 1 }]}>{item.merchant}</Text>
          <Text style={[s.cardTitle, item.transaction_type === 'income' && styles.link]}>{item.transaction_type === 'income' ? '+' : '−'}{minorUnitsToDecimal(item.amount_minor)} €</Text></View>
        <Text style={s.metadata}>{item.category_name} · {item.transaction_date} · {item.payment_method.replace('_', ' ')}{item.is_recurring ? ' · Recurring' : ''}</Text>
        {item.description ? <Text style={s.body}>{item.description}</Text> : null}
        <View style={[s.row, { alignItems: 'center' }]}><Text style={[s.metadata, { flex: 1 }]}>{STATUS_LABEL[item.sync_status]}</Text>
          <Pressable accessibilityRole="button" disabled={busy || item.sync_status === 'conflict'} style={styles.action}
            onPress={() => { setEditing(item); setActionError(null); setEditor(true); }}><Text style={styles.link}>Editar</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy || item.sync_status === 'conflict'} style={styles.action} onPress={() => requestDelete(item)}><Text style={{ color: '#b42318' }}>Eliminar</Text></Pressable>
        </View>
      </View>}
      ListEmptyComponent={isLoading ? null : (
        <View style={[s.card, { gap: 12, alignItems: 'flex-start' }]}>
          <Text style={s.empty}>{Object.values(filters).some((v) => v !== undefined && v !== '') ? 'No hay movimientos que coincidan. Prueba a limpiar algún filtro.' : 'Todavía no tienes movimientos. Añade tu primer gasto o ingreso.'}</Text>
          {!Object.values(filters).some((v) => v !== undefined && v !== '') ? (
            <ActionPressable accessibilityRole="button" haptic="selection" style={s.primaryButton}
              onPress={() => { setInitialType('expense'); setEditing(null); setActionError(null); setEditor(true); }}>
              <Text style={s.primaryButtonText}>Añadir primer movimiento</Text>
            </ActionPressable>
          ) : null}
        </View>
      )}
      ListFooterComponent={<View style={[s.row, { justifyContent: 'space-between', paddingVertical: 12 }]}>
        {page > 0 ? <Pressable accessibilityRole="button" style={s.secondaryButton} onPress={() => setPage(page - 1)}><Text>Página anterior</Text></Pressable> : <View />}
        {transactions.length > 50 ? <Pressable accessibilityRole="button" style={s.secondaryButton} onPress={() => setPage(page + 1)}><Text>Página siguiente</Text></Pressable> : null}
      </View>}
    />
    {filterOpen ? <TransactionFilters filters={filters} categories={categories} onChange={changeFilters} onClose={() => setFilterOpen(false)} /> : null}
    {editor || linkType ? <TransactionEditor item={editing} initialType={linkType ?? initialType} categories={categories.filter((c) => c.archived === 0)} saving={busy}
      error={actionError} onSave={saved} onClose={closeEditor} /> : null}
      <Snackbar message={toast} onDismiss={() => setToast(null)} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f6f7f9' }, content: { padding: 20, gap: 12 },
  title: { fontSize: 32, fontWeight: '800' }, link: { color: '#125c47', fontWeight: '700' },
  action: { minHeight: 44, minWidth: 48, justifyContent: 'center', alignItems: 'center' },
});