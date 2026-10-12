import { StyleSheet, Text, View } from './primitives';
import { uiTokens } from './tokens';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const pillStyle = tone === 'success' ? styles.successPill
    : tone === 'warning' ? styles.warningPill
      : tone === 'danger' ? styles.dangerPill
        : styles.neutralPill;
  const dotStyle = tone === 'success' ? styles.successDot
    : tone === 'warning' ? styles.warningDot
      : tone === 'danger' ? styles.dangerDot
        : styles.neutralDot;
  const labelStyle = tone === 'success' ? styles.successLabel
    : tone === 'warning' ? styles.warningLabel
      : tone === 'danger' ? styles.dangerLabel
        : styles.neutralLabel;

  return (
    <View style={[styles.pill, pillStyle]}>
      <View style={[styles.dot, dotStyle]} />
      <Text style={[styles.label, labelStyle]}>{label}</Text>
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
