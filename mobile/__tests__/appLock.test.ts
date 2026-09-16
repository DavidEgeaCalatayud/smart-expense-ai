import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { createElement, useEffect } from 'react';
import { AppState, type AppStateStatus, Modal } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppLockProvider, useAppLock } from '../src/security/AppLockProvider';

const mockUser = { id: 'account-a' };
jest.mock('../src/auth/AuthProvider', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../src/components/ServerWorkspaceShell', () => ({ serverWorkspaceStyles: {} }));
jest.mock('expo-screen-capture', () => ({ usePreventScreenCapture: jest.fn() }));
jest.mock('expo-local-authentication', () => ({ authenticateAsync: jest.fn(), hasHardwareAsync: jest.fn(async () => true), isEnrolledAsync: jest.fn(async () => true) }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(async () => undefined), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6 }));
let state: ReturnType<typeof useAppLock>;
function Probe() { const value = useAppLock(); useEffect(() => { state = value; }, [value]); return null; }
let renderer: ReactTestRenderer;
let notify: (state: AppStateStatus) => void;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('1');
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { notify = listener; return { remove: jest.fn() }; });
  Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); jest.restoreAllMocks(); });
async function mount() { await act(async () => { renderer = create(createElement(AppLockProvider, null, createElement(Probe))); }); }
it('starts locked and remains locked after cancelling device authentication', async () => {
  await mount(); expect(state.locked).toBe(true);
  jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: false, error: 'user_cancel' });
  const button = renderer.root.findAllByProps({ accessibilityRole: 'button' })[0]!;
  await act(async () => { button.props.onPress(); });
  expect(state.locked).toBe(true);
  expect(renderer.root.findByType(Modal).props.visible).toBe(true);
});
it('unlocks only after success and relocks on leaving the app', async () => {
  await mount();
  jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: true });
  await act(async () => { renderer.root.findAllByProps({ accessibilityRole: 'button' })[0]!.props.onPress(); });
  expect(state.locked).toBe(false);
  await act(async () => { notify('background'); });
  expect(state.locked).toBe(true);
});
it('requires authentication to disable the lock and fails closed if secure preferences cannot be read', async () => {
  jest.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('Secure storage unavailable'));
  await mount(); expect(state.locked).toBe(true);
  jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({ success: false, error: 'user_cancel' });
  await act(async () => { await expect(state.setEnabled(false)).rejects.toThrow('not changed'); });
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(state.enabled).toBe(true);
});
