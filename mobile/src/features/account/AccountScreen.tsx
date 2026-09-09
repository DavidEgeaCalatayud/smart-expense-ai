import { Link } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Switch, Text, TextInput, View } from '../../ui/primitives';
import { getSharedMobileApiClient } from '../../api/client';
import { useCachedServerResource } from '../../api/useCachedServerResource';
import { useOnlineAction } from '../../api/useOnlineAction';
import { useAuth } from '../../auth/AuthProvider';
import { DataFreshness } from '../../components/DataFreshness';
import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';
import { useAppLock } from '../../security/AppLockProvider';
import { useOnlineSync } from '../../sync/OnlineSyncProvider';
import { sharePrivacyExport, validatePasswordChange } from './accountSecurity';
import { NotificationSettings } from './NotificationSettings';

interface SessionInfo { id: string; current: boolean; createdAt: string; lastSeenAt: string; expiresAt: string }
export function AccountScreen() {
  const { user, deleteAccount, changePassword, logout, isSubmitting } = useAuth();
  const lock = useAppLock();
  const action = useOnlineAction();
  const { lastSyncedAt, health } = useOnlineSync();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const loader = useCallback(() => getSharedMobileApiClient().request<SessionInfo[]>('/api/v2/auth/mobile/sessions'), []);
  const sessions = useCachedServerResource('server:mobile-sessions:v1', loader);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(null); setMessage(null);
    try { await operation(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to complete this action'); }
    finally { setBusy(false); }
  };
  const change = () => run(async () => {
    validatePasswordChange(current, password, repeat);
    if (!action.hasNetwork) throw new Error('Connect to change your password.');
    await action.syncNow();
    try {
      // AuthProvider drains all session work itself; do not wrap this in runSessionWork.
      await changePassword(current, password);
      setMessage('Password changed. Other mobile and web sessions have been signed out.');
      await sessions.refresh().catch(() => undefined);
    } finally { setCurrent(''); setPassword(''); setRepeat(''); }
  });
  const canDelete = deletePassword.length > 0 && confirmation === 'DELETE' && !isSubmitting && !busy && action.hasNetwork;
  const confirmDeletion = () => {
    if (!canDelete) return;
    Alert.alert('Permanently delete your account?', 'Your account and financial data will be deleted, including pending changes on this device. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Delete account', style: 'destructive', onPress: () => void run(async () => {
        try { await deleteAccount(deletePassword, confirmation); } finally { setDeletePassword(''); setConfirmation(''); }
      }) },
    ]);
  };
  const signOut = () => {
    if (health.queued + health.sending + health.failed + health.conflicts > 0) {
      Alert.alert('Sign out with pending changes?', 'Changes that have not synced will be removed from this device. Sync first to keep them.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => void run(logout) },
      ]);
    } else void run(logout);
  };
  const disabled = busy || isSubmitting;
  return <ServerWorkspaceShell active="account" title="Account & security" subtitle={user?.email ?? ''}
    isRefreshing={sessions.isRefreshing} onRefresh={() => void sessions.refresh().catch(() => undefined)}>
    {disabled ? <ActivityIndicator /> : null}
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
    {message ? <Text accessibilityRole="alert" style={s.body}>{message}</Text> : null}
    <View style={s.card}>
      <View style={[s.row, { alignItems: 'center', justifyContent: 'space-between' }]}><Text style={s.sectionTitle}>App lock</Text>
        <Switch accessibilityLabel="Biometric app lock" disabled={disabled} value={lock.enabled} onValueChange={(value) => void run(() => lock.setEnabled(value))} /></View>
      <Text style={s.body}>Protect your finances with your fingerprint or face, with your device passcode as a fallback. The app locks when you leave it.</Text>
      <Text style={s.metadata}>Your local database is encrypted. When app lock is on, screenshots and recent-app previews are protected too.</Text>
    </View>
    <View style={s.card}><Text style={s.sectionTitle}>Synchronization</Text>
      <Text style={s.body}>{health.queued + health.sending} pending changes · {health.failed} need attention · {health.conflicts} conflicts</Text>
      <Link href="/transactions" style={{ color: '#125c47', paddingVertical: 12 }}>Review activity and conflicts →</Link>
    </View>
    <NotificationSettings />
    <Link href="/settings" style={{ color: '#125c47', paddingVertical: 12 }}>Appearance, currency and app information →</Link>
    <View style={s.card}>
      <Text style={s.sectionTitle}>Change password</Text>
      <Text style={s.metadata}>Use at least 12 characters. Changing your password signs out other sessions. Sync pending changes first.</Text>
      <TextInput accessibilityLabel="Current password" placeholder="Current password" secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={128} editable={!disabled} value={current} onChangeText={setCurrent} style={s.input} />
      <TextInput accessibilityLabel="New password" placeholder="New password" secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={128} editable={!disabled} value={password} onChangeText={setPassword} style={s.input} />
      <TextInput accessibilityLabel="Confirm new password" placeholder="Confirm new password" secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={128} editable={!disabled} value={repeat} onChangeText={setRepeat} style={s.input} />
      <Pressable accessibilityRole="button" disabled={disabled || !action.hasNetwork} onPress={() => void change()} style={s.primaryButton}><Text style={s.primaryButtonText}>Change password</Text></Pressable>
    </View>
    <View style={s.card}>
      <Text style={s.sectionTitle}>Your data</Text>
      <Text style={s.body}>Export your account and financial records as JSON. The export contains private information; choose where to save it.</Text>
      <Pressable accessibilityRole="button" disabled={disabled || !action.hasNetwork} onPress={() => void run(() => action.run(sharePrivacyExport))} style={s.secondaryButton}><Text>Export my data</Text></Pressable>
    </View>
    <View style={s.section}>
      <Text style={s.sectionTitle}>Mobile sessions</Text>
      <DataFreshness cachedAt={sessions.cachedAt} isCachedFallback={sessions.isCachedFallback} />
      <Text style={s.metadata}>Last successful sync on this device: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Not yet synced'}</Text>
      {sessions.error ? <Text style={s.metadata}>Session details could not refresh. Connect and try again.</Text> : null}
      {sessions.data?.map((session) => <View style={s.card} key={session.id}>
        <Text style={s.cardTitle}>{session.current ? 'This device' : 'Another mobile session'}</Text>
        <Text style={s.metadata}>Signed in: {new Date(session.createdAt).toLocaleString()}</Text>
        <Text style={s.metadata}>Last token refresh: {new Date(session.lastSeenAt).toLocaleString()}</Text>
        <Text style={s.metadata}>Expires: {new Date(session.expiresAt).toLocaleString()}</Text>
      </View>)}
      <Text style={s.metadata}>This list covers mobile sessions. Change your password to revoke other mobile and web sessions.</Text>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={signOut} style={s.secondaryButton}><Text>Sign out</Text></Pressable>
    </View>
    <View style={s.card}>
      <Text style={s.sectionTitle}>Delete account and data</Text>
      <Text style={s.body}>This permanently deletes your account and its financial records from the service, and clears this device. An internet connection is required.</Text>
      <TextInput accessibilityLabel="Password for account deletion" placeholder="Current password" secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={128} editable={!disabled} value={deletePassword} onChangeText={setDeletePassword} style={s.input} />
      <TextInput accessibilityLabel="Deletion confirmation" placeholder="Type DELETE" autoCapitalize="characters" autoCorrect={false} editable={!disabled} value={confirmation} onChangeText={setConfirmation} style={s.input} />
      <Pressable accessibilityRole="button" disabled={!canDelete} onPress={confirmDeletion} style={[s.primaryButton, { backgroundColor: '#b42318', opacity: canDelete ? 1 : 0.5 }]}><Text style={s.primaryButtonText}>Delete account and data</Text></Pressable>
    </View>
  </ServerWorkspaceShell>;
}
