import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from './primitives';
import { uiTokens } from './tokens';

function Snackbar({ message, onDismiss }: { message: string | null; onDismiss(): void }) {
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

const SnackbarContext = createContext<{ showSnackbar(message: string): void }>({
  showSnackbar: () => undefined,
});

export function SnackbarProvider({ children }: PropsWithChildren) {
  const [message, setMessage] = useState<string | null>(null);
  const showSnackbar = useCallback((next: string) => setMessage(next), []);
  const dismiss = useCallback(() => setMessage(null), []);

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      <Snackbar message={message} onDismiss={dismiss} />
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  return useContext(SnackbarContext);
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 86,
    zIndex: 1000,
    elevation: 20,
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
