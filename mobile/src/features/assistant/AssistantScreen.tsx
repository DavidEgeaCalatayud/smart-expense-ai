import type { FinancialAssistantAnswer } from '@smart-expense-ai/api-contracts';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { createServerDerivedApi } from '../../api/serverDerivedApi';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';

export function AssistantScreen() {
  const api = useMemo(createServerDerivedApi, []);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<FinancialAssistantAnswer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const normalized = question.trim();
    if (!normalized) return;
    setIsSubmitting(true);
    setError(null);
    try {
      setAnswer(await api.queryAssistant(normalized));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to query Financial Assistant');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ServerWorkspaceShell
      active="assistant"
      title="Financial Assistant"
      subtitle="Stateless, evidence-grounded assistant. Questions are sent to the existing FastAPI boundary; Android stores no conversation history and never receives provider credentials."
      isRefreshing={false}
      onRefresh={() => setAnswer(null)}
    >
      <View style={s.section}>
        <Text style={s.sectionTitle}>Ask about your finances</Text>
        <TextInput
          accessibilityLabel="Financial Assistant question"
          multiline
          maxLength={2000}
          placeholder="For example: How did my spending change compared with last month?"
          value={question}
          onChangeText={setQuestion}
          style={[s.input, styles.questionInput]}
        />
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting || !question.trim()}
          onPress={() => void submit()}
          style={({ pressed }) => [
            s.primaryButton,
            pressed && styles.pressed,
            (isSubmitting || !question.trim()) && styles.disabled,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={s.primaryButtonText}>Ask server assistant</Text>
          )}
        </Pressable>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>

      {answer ? (
        <View style={s.section}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Answer</Text>
            <Text style={s.body}>{answer.answer}</Text>
            <Text style={s.metadata}>Request {answer.requestId}</Text>
          </View>

          <Text style={s.sectionTitle}>Evidence</Text>
          {answer.evidence.length === 0 ? (
            <Text style={s.empty}>The answer returned no canonical evidence references.</Text>
          ) : (
            answer.evidence.map((evidence) => (
              <View key={`${evidence.source}:${evidence.reference}`} style={s.card}>
                <Text style={s.cardTitle}>{evidence.label}</Text>
                <Text style={s.metadata}>{evidence.source} · {evidence.reference}</Text>
              </View>
            ))
          )}

          {answer.limitations.length > 0 ? (
            <View style={s.card}>
              <Text style={s.cardTitle}>Limitations</Text>
              {answer.limitations.map((limitation) => (
                <Text key={limitation} style={s.body}>• {limitation}</Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </ServerWorkspaceShell>
  );
}

const styles = StyleSheet.create({
  questionInput: { minHeight: 110, textAlignVertical: 'top' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
