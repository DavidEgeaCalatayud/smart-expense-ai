import { DateField } from '../../components/DateField';
import { useAppLock } from '../../security/AppLockProvider';
import { Modal, Pressable, ScrollView, Text, View , SafeAreaView } from '../../ui/primitives';
import { ChoiceField } from '../../components/ChoiceField';
import { currentMonth, MonthSelector } from '../../components/MonthSelector';
import { serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';
import type { LocalCategoryRow } from '../../database/types';
import type { TransactionFilters as Filters } from '../../repositories/transactionRepository';

export function TransactionFilters({ filters, categories, onChange, onClose }: {
  filters: Filters; categories: LocalCategoryRow[]; onChange(value: Filters): void; onClose(): void;
}) {
  const { locked } = useAppLock();
  const update = (value: Partial<Filters>) => onChange({ ...filters, ...value });
  return <Modal visible={!locked} animationType="slide" onRequestClose={onClose}><SafeAreaView style={{ flex: 1, backgroundColor: '#f6f7f9' }}>
    <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
      <Text style={s.sectionTitle}>Filter activity</Text>
      <View style={s.row}>
        <Pressable accessibilityRole="button" style={s.secondaryButton} onPress={() => update({ month: undefined })}><Text>All months{!filters.month ? ' ✓' : ''}</Text></Pressable>
        <Pressable accessibilityRole="button" style={s.secondaryButton} onPress={() => update({ month: currentMonth(), dateFrom: undefined, dateTo: undefined })}><Text>This month</Text></Pressable>
      </View>
      {filters.month ? <MonthSelector month={filters.month} onChange={(month) => update({ month, dateFrom: undefined, dateTo: undefined })} /> : null}
      <DateField label="From date" value={filters.dateFrom} optional onChange={(dateFrom) => update({ dateFrom, month: undefined })} />
      <DateField label="To date" value={filters.dateTo} optional onChange={(dateTo) => update({ dateTo, month: undefined })} />
      <ChoiceField label="Filter category" value={filters.categoryId ?? ''} options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c.id, label: `${c.name} · ${c.transaction_type}` }))]}
        onChange={(categoryId) => update({ categoryId: categoryId || undefined })} />
      <ChoiceField label="Transaction type" value={filters.type ?? ''} options={[{ value: '', label: 'All types' }, { value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]}
        onChange={(type) => update({ type: (type || undefined) as Filters['type'] })} />
      <ChoiceField label="Recurring" value={filters.recurring === undefined ? '' : String(filters.recurring)} options={[{ value: '', label: 'All transactions' }, { value: 'true', label: 'Recurring only' }, { value: 'false', label: 'Not recurring' }]}
        onChange={(value) => update({ recurring: value === '' ? undefined : value === 'true' })} />
      <ChoiceField label="Sync status" value={filters.status ?? ''} options={[{ value: '', label: 'All statuses' }, { value: 'synced', label: 'Synced' }, { value: 'pending', label: 'Pending sync' }, { value: 'failed', label: 'Needs attention' }, { value: 'conflict', label: 'Conflict' }]}
        onChange={(status) => update({ status: (status || undefined) as Filters['status'] })} />
      <ChoiceField label="Sort" value={filters.sort ?? 'newest'} options={[{ value: 'newest', label: 'Newest' }, { value: 'oldest', label: 'Oldest' }, { value: 'highest', label: 'Highest amount' }, { value: 'lowest', label: 'Lowest amount' }]}
        onChange={(sort) => update({ sort })} />
      <Pressable accessibilityRole="button" style={s.secondaryButton} onPress={() => onChange({ search: filters.search })}><Text>Clear filters</Text></Pressable>
      <Pressable accessibilityRole="button" style={s.primaryButton} onPress={onClose}><Text style={s.primaryButtonText}>Show transactions</Text></Pressable>
    </ScrollView>
  </SafeAreaView></Modal>;
}
