import type { FinancialAssistantAnswer } from '@smart-expense-ai/api-contracts';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from '../../ui/primitives';

import { useOnlineAction } from '../../api/useOnlineAction';
import { createServerDerivedApi } from '../../api/serverDerivedApi';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';

export function AssistantScreen() {
  const api = useMemo(() => createServerDerivedApi(), []);
  const online = useOnlineAction();
  const [question, setQuestion] = useState('');
  const [answer, setRespuesta] = useState<FinancialAssistantAnswer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const normalized = question.trim();
    if (!normalized) return;
    setIsSubmitting(true);
    setError(null);
    try {
      setRespuesta(await online.run(() => api.queryAssistant(normalized)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se ha podido consultar el asistente financiero');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ServerWorkspaceShell
      active="assistant"
      title="Asistente financiero"
      subtitle="Pregunta sobre tus finanzas usando la información más reciente de tu cuenta. Esta conversación no se guarda en el móvil."
      isRefreshing={isSubmitting}
      onRefresh={() => {
        setRespuesta(null);
        setError(null);
        void online.syncNow().catch(() => undefined);
      }}
    >
      {!online.hasNetwork ? <Text style={s.metadata}>Conéctate para hacer una nueva consulta.</Text> : null}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Pregunta sobre tus finanzas</Text>
        <TextInput
          accessibilityLabel="Asistente financiero question"
          multiline
          maxLength={2000}
          placeholder="Por ejemplo: ¿Cómo ha cambiado mi gasto respecto al mes pasado?"
          value={question}
          onChangeText={setQuestion}
          style={[s.input, styles.questionInput]}
        />
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting || !online.hasNetwork || !question.trim()}
          onPress={() => void submit()}
          style={({ pressed }) => [
            s.primaryButton,
            pressed && styles.pressed,
            (isSubmitting || !online.hasNetwork || !question.trim()) && styles.disabled,
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={s.primaryButtonText}>Preguntar al asistente</Text>
          )}
        </Pressable>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>

      {answer ? (
        <View style={s.section}>
          <View style={s.card}>
            <Text style={s.cardTitle}>Respuesta</Text>
            <Text style={s.body}>{answer.answer}</Text>
            <Text style={s.metadata}>Consulta {answer.requestId}</Text>
          </View>

          <Text style={s.sectionTitle}>Evidencias</Text>
          {answer.evidence.length === 0 ? (
            <Text style={s.empty}>La respuesta no incluyó referencias adicionales.</Text>
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
              <Text style={s.cardTitle}>Limitaciones</Text>
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
