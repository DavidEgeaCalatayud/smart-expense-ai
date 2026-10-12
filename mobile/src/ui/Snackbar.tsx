import { useEffect } from 'react';
import { StyleSheet, Text, View } from './primitives';
import { uiTokens } from './tokens';

export function Snackbar({ message, onDismiss }: { message: string | null; onDismiss(): void }) {
  useEffect(() => {
    if (!message) return undefined;
    const timeout = setTimeout(onDismiss, 3200);
    return () => clearTimeout(timeout);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <View accessibilityLiveRegion="polite" style={styles.container}>
      <Text style={styles.check}>✓</Text>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 86,
    zIndex: 100,
    minHeight: uiTokens.touchTarget,
    borderRadius: uiTokens.radius.lg,
    backgroundColor: uiTokens.color.text,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  check: { color: '#86efac', fontWeight: '900', fontSize: 17 },
  text: { color: '#ffffff', flex: 1, fontWeight: '700', fontSize: 14 },
});
