import { useAppLock } from '../../security/AppLockProvider';
import { DateField } from '../../components/DateField';
import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View , SafeAreaView } from '../../ui/primitives';
import { ChoiceField } from '../../components/ChoiceField';
import { serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';
import type { LocalCategoryRow, LocalTransactionRow } from '../../database/types';
import { localDate, type OfflineTransactionFormInput } from './validation';

export const PAYMENT_METHODS = [
  { value: 'card' as const, label: 'Card' }, { value: 'cash' as const, label: 'Cash' },
  { value: 'bank_transfer' as const, label: 'Bank transfer' }, { value: 'direct_debit' as const, label: 'Direct debit' },
];
export function TransactionEditor({ item, initialType, categories, saving, error, onSave, onClose }: {
  item: LocalTransactionRow | null; initialType: 'expense' | 'income'; categories: LocalCategoryRow[];
  saving: boolean; error: string | null; onSave(input: OfflineTransactionFormInput): Promise<void>; onClose(): void;
}) {
  const { locked } = useAppLock();
  const [type, setType] = useState(item?.transaction_type ?? initialType);
  const [merchant, setMerchant] = useState(item?.merchant ?? '');
  const [amount, setAmount] = useState(item ? minorUnitsToDecimal(item.amount_minor) : '');
  const [categoryId, setCategoryId] = useState(item?.category_id ?? categories.find((c) => c.transaction_type === initialType && c.normalized_name === 'general')?.id ?? '__new');
  const [categoryName, setCategoryName] = useState('General');
  const [date, setDate] = useState(item?.transaction_date ?? localDate());
  const [method, setMethod] = useState(item?.payment_method ?? 'card');
  const [description, setDescription] = useState(item?.description ?? '');
  const [recurring, setRecurring] = useState(item?.is_recurring === 1);
  const choices = categories.filter((c) => c.transaction_type === type).map((c) => ({ value: c.id, label: c.name }));
  if (item && item.transaction_type === type && !choices.some((c) => c.value === item.category_id)) {
    choices.push({ value: item.category_id, label: `${item.category_name} (archived)` });
  }
  choices.push({ value: '__new', label: 'New category…' });
  const changeType = (next: 'expense' | 'income') => {
    setType(next);
    setCategoryId(categories.find((c) => c.transaction_type === next)?.id ?? '__new');
    setCategoryName(next === 'income' ? 'Income' : 'General');
  };
  const save = () => onSave({ merchant, amount, transactionDate: date, transactionType: type,
    categoryId: categoryId === '__new' ? undefined : categoryId,
    categoryName: categoryId === '__new' ? categoryName : categories.find((c) => c.id === categoryId)?.name ?? item?.category_name ?? '',
    paymentMethod: method, description, isRecurring: recurring });
  return <Modal visible={!locked} animationType="slide" onRequestClose={() => { if (!saving) onClose(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f6f7f9' }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={[s.row, { alignItems: 'center', justifyContent: 'space-between' }]}>
            <Text style={s.sectionTitle}>{item ? 'Edit transaction' : 'New transaction'}</Text>
            <Pressable accessibilityRole="button" disabled={saving} onPress={onClose} style={s.secondaryButton}><Text>Cancel</Text></Pressable>
          </View>
          <View style={s.row}>{(['expense', 'income'] as const).map((value) => <Pressable key={value} accessibilityRole="radio"
            accessibilityState={{ checked: type === value }} disabled={saving} onPress={() => changeType(value)}
            style={[type === value ? s.primaryButton : s.secondaryButton, { flex: 1 }]}>
            <Text style={type === value ? s.primaryButtonText : s.secondaryButtonText}>{value === 'expense' ? 'Expense' : 'Income'}</Text>
          </Pressable>)}</View>
          <TextInput accessibilityLabel="Amount" placeholder="Amount (€)" keyboardType="decimal-pad" maxLength={16}
            editable={!saving} value={amount} onChangeText={setAmount} style={[s.input, { fontSize: 30, fontWeight: '700' }]} />
          <TextInput accessibilityLabel="Merchant" placeholder={type === 'income' ? 'From whom? e.g. Employer' : 'Where? e.g. Grocery store'}
            editable={!saving} value={merchant} onChangeText={setMerchant} maxLength={120} style={s.input} />
          <ChoiceField label="Category" value={categoryId} options={choices} onChange={setCategoryId} disabled={saving} />
          {categoryId === '__new' ? <TextInput accessibilityLabel="New category name" placeholder="New category name"
            editable={!saving} value={categoryName} onChangeText={setCategoryName} maxLength={80} style={s.input} /> : null}
          <DateField label="Transaction date" value={date} disabled={saving} onChange={(value) => { if (value) setDate(value); }} />
          <ChoiceField<LocalTransactionRow['payment_method']> label="Payment method" value={method} options={PAYMENT_METHODS} onChange={setMethod} disabled={saving} />
          <TextInput accessibilityLabel="Description" placeholder="Description (optional)" multiline maxLength={500}
            editable={!saving} value={description} onChangeText={setDescription} style={s.input} />
          <View style={[s.row, { alignItems: 'center', justifyContent: 'space-between' }]}><Text style={s.cardTitle}>Recurring</Text>
            <Switch accessibilityLabel="Recurring transaction" value={recurring} onValueChange={setRecurring} disabled={saving} /></View>
          <Text style={s.metadata}>Mark subscriptions and other repeating payments. This does not create automatic charges.</Text>
          {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save().catch(() => undefined)} style={s.primaryButton}>
            <Text style={s.primaryButtonText}>{saving ? 'Saving…' : item ? 'Save changes' : 'Save transaction'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
