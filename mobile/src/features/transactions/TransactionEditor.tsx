import { useAppLock } from '../../security/AppLockProvider';
import { DateField } from '../../components/DateField';
import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View , SafeAreaView } from '../../ui/primitives';
import { ChoiceField } from '../../components/ChoiceField';
import { serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';
import type { LocalCategoryRow, LocalTransactionRow } from '../../database/types';
import { localDate, type OfflineTransactionFormInput } from './validation';
import { canonicalMoneyInput, formatMoneyInput } from '../../ui/moneyInput';
import { ActionPressable } from '../../ui/ActionPressable';

export const PAYMENT_METHODS = [
  { value: 'card' as const, label: 'Tarjeta' }, { value: 'cash' as const, label: 'Efectivo' },
  { value: 'bank_transfer' as const, label: 'Transferencia' }, { value: 'direct_debit' as const, label: 'Domiciliación' },
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
            <Pressable accessibilityRole="button" disabled={saving} onPress={onClose} style={s.secondaryButton}><Text>Cancelar</Text></Pressable>
          </View>
          <View style={s.row}>{(['expense', 'income'] as const).map((value) => <Pressable key={value} accessibilityRole="radio"
            accessibilityState={{ checked: type === value }} disabled={saving} onPress={() => changeType(value)}
            style={[type === value ? s.primaryButton : s.secondaryButton, { flex: 1 }]}>
            <Text style={type === value ? s.primaryButtonText : s.secondaryButtonText}>{value === 'expense' ? 'Expense' : 'Income'}</Text>
          </Pressable>)}</View>
          <TextInput accessibilityLabel="Amount" autoFocus placeholder="Importe (€)" keyboardType="decimal-pad" maxLength={24}
            editable={!saving} value={amount} onChangeText={setAmount}
            onFocus={() => setAmount((current) => canonicalMoneyInput(current))}
            onBlur={() => { if (amount.trim()) setAmount(formatMoneyInput(amount)); }}
            style={[s.input, { fontSize: 30, fontWeight: '700' }]} />
          <TextInput accessibilityLabel="Merchant" placeholder={type === 'income' ? '¿De quién? Ej. Empresa' : '¿Dónde? Ej. Supermercado'}
            editable={!saving} value={merchant} onChangeText={setMerchant} maxLength={120} style={s.input} />
          <ChoiceField label="Categoría" value={categoryId} options={choices} onChange={setCategoryId} disabled={saving} />
          {categoryId === '__new' ? <TextInput accessibilityLabel="New category name" placeholder="Nombre de la nueva categoría"
            editable={!saving} value={categoryName} onChangeText={setCategoryName} maxLength={80} style={s.input} /> : null}
          <DateField label="Fecha" value={date} disabled={saving} onChange={(value) => { if (value) setDate(value); }} />
          <ChoiceField<LocalTransactionRow['payment_method']> label="Método de pago" value={method} options={PAYMENT_METHODS} onChange={setMethod} disabled={saving} />
          <TextInput accessibilityLabel="Description" placeholder="Descripción (opcional)" multiline maxLength={500}
            editable={!saving} value={description} onChangeText={setDescription} style={s.input} />
          <View style={[s.row, { alignItems: 'center', justifyContent: 'space-between' }]}><Text style={s.cardTitle}>Recurrente</Text>
            <Switch accessibilityLabel="Recurring transaction" value={recurring} onValueChange={setRecurring} disabled={saving} /></View>
          <Text style={s.metadata}>Marca suscripciones y otros pagos repetitivos. Esto no crea cargos automáticos.</Text>
          {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
          <ActionPressable accessibilityRole="button" haptic="success" disabled={saving} onPress={() => void save().catch(() => undefined)} style={s.primaryButton}>
            <Text style={s.primaryButtonText}>{saving ? 'Guardando…' : item ? 'Guardar cambios' : 'Guardar movimiento'}</Text>
          </ActionPressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
