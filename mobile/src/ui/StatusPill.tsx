import { StyleSheet, Text, View } from './primitives';
import { uiTokens } from './tokens';

export function StatusPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  return (
    <View style={[styles.pill, styles[`${tone}Pill`]]}>
      <View style={[styles.dot, styles[`${tone}Dot`]]} />
      <Text style={[styles.label, styles[`${tone}Label`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 34,
    alignSelf: 'flex-start',
    borderRadius: uiTokens.radius.pill,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 12, fontWeight: '800' },

  successPill: { backgroundColor: '#edf7f2' },
  successDot: { backgroundColor: uiTokens.color.success },
  successLabel: { color: uiTokens.color.brand },

  warningPill: { backgroundColor: '#fff7ed' },
  warningDot: { backgroundColor: '#d97706' },
  warningLabel: { color: '#9a3412' },

  dangerPill: { backgroundColor: '#fef2f2' },
  dangerDot: { backgroundColor: uiTokens.color.danger },
  dangerLabel: { color: uiTokens.color.danger },

  neutralPill: { backgroundColor: '#eef2f7' },
  neutralDot: { backgroundColor: uiTokens.color.muted },
  neutralLabel: { color: uiTokens.color.muted },
});
