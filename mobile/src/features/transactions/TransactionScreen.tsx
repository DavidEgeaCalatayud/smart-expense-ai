import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import type { LocalTransactionRow } from '../../database/types';
import { useTransactions } from './useTransactions';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function TransactionItem({ item }: { item: LocalTransactionRow }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.merchant}>{item.merchant}</Text>
        <Text style={styles.amount}>{minorUnitsToDecimal(item.amount_minor)} €</Text>
      </View>
      <Text style={styles.metadata}>
        {item.category_name} · {item.transaction_date}
      </Text>
      <Text style={styles.pending}>Queued locally · sync wiring arrives in Phase 5E</Text>
    </View>
  );
}

export function TransactionScreen() {
  const { user, logout, isSubmitting: isAuthSubmitting } = useAuth();
  const { transactions, isLoading, isSaving, error, create } = useTransactions();
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryName, setCategoryName] = useState('General');
  const [transactionDate, setTransactionDate] = useState(todayIsoDate());

  const submit = async () => {
    try {
      await create({ merchant, amount, categoryName, transactionDate });
      setMerchant('');
      setAmount('');
    } catch {
      // Error state is owned by the hook and rendered below.
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <TransactionItem item={item} />}
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
                disabled={isAuthSubmitting}
                onPress={() => void logout()}
                style={({ pressed }) => [
                  styles.logoutButton,
                  pressed && styles.buttonPressed,
                  isAuthSubmitting && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.logoutText}>Sign out</Text>
              </Pressable>
            </View>

            <Text style={styles.title}>Offline transactions</Text>
            <Text style={styles.subtitle}>
              Phase 5D authenticates this device with a revocable native session while SQLite
              remains the local offline workspace.
            </Text>

            <View style={styles.form}>
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
                placeholder="Category"
                value={categoryName}
                onChangeText={setCategoryName}
                style={styles.input}
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
                disabled={isSaving}
                onPress={() => void submit()}
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  isSaving && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.buttonText}>
                  {isSaving ? 'Saving…' : 'Save offline'}
                </Text>
              </Pressable>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Stored on this device</Text>
              {isLoading ? <ActivityIndicator /> : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : (
            <Text style={styles.empty}>
              No local transactions yet. Create one and it remains available offline.
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
  form: { gap: 10, marginTop: 4 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d9dde3',
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
  },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  error: { color: '#b42318', fontSize: 14 },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  sectionTitle: { fontSize: 19, fontWeight: '700' },
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
  pending: { fontSize: 12, fontWeight: '600', opacity: 0.55 },
  empty: { fontSize: 14, lineHeight: 21, opacity: 0.65, paddingVertical: 12 },
});
