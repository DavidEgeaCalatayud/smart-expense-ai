import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { PasswordRecoveryScreen } from '../src/features/auth/PasswordRecoveryScreen';
import { MobileAuthClient } from '../src/auth/mobileAuthClient';

let mockToken: string | undefined;
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ token: mockToken }) }));
jest.mock('../src/ui/primitives', () => { const rn = jest.requireActual('react-native'); return { ...rn, SafeAreaView: rn.View }; });
jest.mock('../src/ui/Link', () => ({ Link: 'Link' }));
jest.mock('../src/api/config', () => ({ getMobileApiBaseUrl: () => 'https://api.example.test' }));
let renderer: ReactTestRenderer;
beforeEach(() => { mockToken = 'a'.repeat(43); });
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); jest.restoreAllMocks(); });
async function mount(mode: 'request' | 'reset') { await act(async () => { renderer = create(createElement(PasswordRecoveryScreen, { mode })); }); }
async function input(label: string, text: string) { await act(async () => renderer.root.findAllByProps({ accessibilityLabel: label })[0]!.props.onChangeText(text)); }
async function press(label: string) { await act(async () => { renderer.root.findAllByProps({ accessibilityLabel: label })[0]!.props.onPress(); }); }
it('submits a recovery email and shows the neutral confirmation', async () => {
  const request = jest.spyOn(MobileAuthClient.prototype, 'requestPasswordReset').mockResolvedValue({ message: 'If an account exists for that email, you will receive instructions to reset your password.' });
  await mount('request'); await input('Recovery email', 'native@example.com'); await press('Send recovery email');
  expect(request).toHaveBeenCalledWith('native@example.com');
  expect(JSON.stringify(renderer.toJSON())).toContain('If an account exists');
});
it('does not consume tokens on mount and validates password confirmation', async () => {
  const confirm = jest.spyOn(MobileAuthClient.prototype, 'confirmPasswordReset').mockResolvedValue();
  await mount('reset'); expect(confirm).not.toHaveBeenCalled();
  await input('New password', 'new-native-password-123'); await input('Confirm new password', 'wrong-native-password-123');
  await press('Save new password'); expect(confirm).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer.toJSON())).toContain('Passwords do not match');
  await input('Confirm new password', 'new-native-password-123'); await press('Save new password');
  expect(confirm).toHaveBeenCalledWith('a'.repeat(43), 'new-native-password-123');
  expect(JSON.stringify(renderer.toJSON())).toContain('signed out on all devices');
});
it('handles missing and expired links without storing credentials', async () => {
  mockToken = undefined; await mount('reset');
  expect(JSON.stringify(renderer.toJSON())).toContain('missing or invalid');
  expect(renderer.root.findAllByProps({ accessibilityLabel: 'Save new password' })).toHaveLength(0);
});
