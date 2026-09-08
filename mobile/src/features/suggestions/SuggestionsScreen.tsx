import type { CategorySuggestionPreviewResponse } from '@smart-expense-ai/api-contracts';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useOnlineAction } from '../../api/useOnlineAction';
import { createServerDerivedApi } from '../../api/serverDerivedApi';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';

export function SuggestionsScreen() {
  const api = useMemo(() => createServerDerivedApi(), []);
  const online = useOnlineAction();
  const [merchant, setMerchant] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [suggestion, setSuggestion] = useState<CategorySuggestionPreviewResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = async () => {
    const normalized = merchant.trim();
    if (!normalized) return;
    setIsSubmitting(true);
    setError(null);
    setSuggestion(null);
    try {
      setSuggestion(await online.run(() => api.previewCategorySuggestion(normalized, type)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No category suggestion is available');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ServerWorkspaceShell
      active="suggestions"
      title="Category Suggestions"
      subtitle="Find a suggested category for a merchant. You choose whether to use it; your transactions are never changed automatically."
      isRefreshing={isSubmitting}
      onRefresh={() => {
        setSuggestion(null);
        setError(null);
        void online.syncNow().catch(() => undefined);
      }}
    >
      {!online.hasNetwork ? <Text style={s.metadata}>Connect to request a new result.</Text> : null}
      <View style={s.section}>
        <TextInput
          accessibilityLabel="Suggestion merchant"
          maxLength={120}
          placeholder="Merchant"
          value={merchant}
          onChangeText={setMerchant}
          style={s.input}
        />
        <View style={styles.typeRow}>
          {(['expense', 'income'] as const).map((option) => (
            <Pressable
              key={option}
              accessibilityRole="button"
              onPress={() => setType(option)}
              style={[s.secondaryButton, type === option && styles.selected]}
            >
              <Text style={s.secondaryButtonText}>{option === 'expense' ? 'Expense' : 'Income'}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting || !online.hasNetwork || !merchant.trim()}
          onPress={() => void preview()}
          style={({ pressed }) => [
            s.primaryButton,
            pressed && styles.pressed,
            (isSubmitting || !online.hasNetwork || !merchant.trim()) && styles.disabled,
          ]}
        >
          <Text style={s.primaryButtonText}>{isSubmitting ? 'Checking…' : 'Ask for suggestion'}</Text>
        </Pressable>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>

      {suggestion ? (
        <View style={s.card}>
          <Text style={s.metadata}>Suggested category</Text>
          <Text style={s.cardValue}>{suggestion.categoryName}</Text>
          <Text style={s.body}>
            Source: {suggestion.source === 'user_history' ? 'Your accepted/corrected history' : 'Global model'}
          </Text>
          <Text style={s.metadata}>Model: {suggestion.modelVersion}</Text>
          <Text style={s.metadata}>Features: {suggestion.featurePolicy}</Text>
          <Text style={s.metadata}>
            This preview has not changed any transaction. Use the category manually when creating or editing a transaction.
          </Text>
        </View>
      ) : null}
    </ServerWorkspaceShell>
  );
}

const styles = StyleSheet.create({
  typeRow: { flexDirection: 'row', gap: 8 },
  selected: { backgroundColor: '#e8ebef' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
