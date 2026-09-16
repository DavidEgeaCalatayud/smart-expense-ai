import * as LocalAuthentication from 'expo-local-authentication';
import { usePreventScreenCapture } from 'expo-screen-capture';
import * as SecureStore from 'expo-secure-store';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, Text, View } from '../ui/primitives';
import { useAuth } from '../auth/AuthProvider';
import { serverWorkspaceStyles as s } from '../components/ServerWorkspaceShell';

interface AppLockValue { enabled: boolean; locked: boolean; setEnabled(value: boolean): Promise<void> }
const Context = createContext<AppLockValue | null>(null);
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
function PrivateScreen() { usePreventScreenCapture('app-lock'); return null; }

export function AppLockProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompting, setPrompting] = useState(false);
  const promptActive = useRef(false);
  const alive = useRef(true);
  const key = `smart-expense-ai.app-lock.${user?.id ?? 'signed-out'}`;
  useEffect(() => {
    alive.current = true;
    void (async () => {
      try {
        const active = user ? await SecureStore.getItemAsync(key, OPTIONS) === '1' : false;
        if (alive.current) { setEnabledState(active); setLocked(active); setReady(true); }
      } catch {
        // A storage failure must not turn an existing local lock off.
        if (alive.current) { setEnabledState(true); setLocked(true); setReady(true); setError('Unable to read app lock settings. Unlock to continue.'); }
      }
    })();
    return () => { alive.current = false; };
  }, [key, user]);

  const authenticate = useCallback(async () => {
    if (promptActive.current) return false;
    promptActive.current = true; setPrompting(true); setError(null);
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Smart Expense AI',
        promptSubtitle: 'Confirm it is you to view your finances', cancelLabel: 'Cancel',
        biometricsSecurityLevel: 'strong', disableDeviceFallback: false, fallbackLabel: 'Use device passcode' });
      if (!result.success && alive.current) setError('App remains locked. Use your fingerprint, face or device passcode to continue.');
      return result.success;
    } catch {
      if (alive.current) setError('Device authentication is unavailable. Check your device security settings and try again.');
      return false;
    } finally { promptActive.current = false; if (alive.current) setPrompting(false); }
  }, []);
  const unlock = useCallback(async () => {
    if (await authenticate()) { if (alive.current) setLocked(AppState.currentState === 'background'); }
  }, [authenticate]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (enabled && state !== 'active' && !promptActive.current) setLocked(true);
    });
    return () => listener.remove();
  }, [enabled]);
  const setEnabled = useCallback(async (value: boolean) => {
    if (value && (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync()))) {
      throw new Error('Set up a fingerprint or face unlock in your device settings first.');
    }
    if (!(await authenticate())) throw new Error('App lock setting was not changed.');
    await SecureStore.setItemAsync(key, value ? '1' : '0', OPTIONS);
    if (alive.current) { setEnabledState(value); setLocked(value && AppState.currentState === 'background'); }
  }, [authenticate, key]);
  return <Context.Provider value={{ enabled, locked: enabled && locked, setEnabled }}>
    {enabled ? <PrivateScreen /> : null}
    {!ready ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator /></View> : children}
    <Modal visible={ready && enabled && locked} animationType="none" onRequestClose={() => undefined}>
      <View style={{ flex: 1, backgroundColor: '#f6f7f9', justifyContent: 'center', padding: 32, gap: 20 }}>
        <Text style={[s.sectionTitle, { fontSize: 30 }]}>Your finances are locked</Text>
        <Text style={s.body}>Use your fingerprint, face or device passcode to open Smart Expense AI.</Text>
        {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={prompting} onPress={() => void unlock()} style={s.primaryButton}>
          <Text style={s.primaryButtonText}>{prompting ? 'Waiting for verification…' : 'Unlock'}</Text>
        </Pressable>
      </View>
    </Modal>
  </Context.Provider>;
}
export function useAppLock() {
  const value = useContext(Context);
  if (!value) throw new Error('useAppLock requires AppLockProvider');
  return value;
}
