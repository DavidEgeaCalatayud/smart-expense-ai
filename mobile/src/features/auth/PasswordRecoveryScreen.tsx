import { useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { getMobileApiBaseUrl } from '../../api/config';
import { MobileAuthClient } from '../../auth/mobileAuthClient';
import { Link } from '../../ui/Link';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput } from '../../ui/primitives';

export function PasswordRecoveryScreen({ mode }: { mode: 'request' | 'reset' }) {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const [token] = useState(() => typeof params.token === 'string' ? params.token : '');
  const client = useMemo(() => new MobileAuthClient(getMobileApiBaseUrl()), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const reset = mode === 'reset';
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);

  async function submit() {
    if (submitting.current) return;
    setError('');
    if (reset && password !== confirmation) { setError('Passwords do not match.'); return; }
    submitting.current = true;
    setPending(true);
    try {
      if (reset) {
        await client.confirmPasswordReset(token, password);
        setPassword(''); setConfirmation('');
        setMessage('Password changed. You have been signed out on all devices. Sign in with your new password.');
      } else {
        const result = await client.requestPasswordReset(email);
        setMessage(result.message);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to complete password recovery.');
    } finally {
      submitting.current = false; setPending(false);
    }
  }

  return <SafeAreaView style={styles.safeArea}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>SMART EXPENSE AI</Text>
        <Text accessibilityRole="header" style={styles.title}>{reset ? 'Reset password' : 'Forgot password'}</Text>
        <Text style={styles.description}>{reset ? 'Choose a password with 12–128 characters. This will sign you out on all devices.' : "We'll send you a secure link to choose a new password. Check your spam folder too."}</Text>
        {message ? <Text accessibilityLiveRegion="polite" style={styles.description}>{message}</Text>
          : reset && !validToken ? <Text accessibilityRole="alert" style={styles.error}>This reset link is missing or invalid. Request a new one.</Text>
          : <>
            {reset ? <>
              <TextInput accessibilityLabel="New password" placeholder="New password (12+ characters)" autoCapitalize="none" autoComplete="new-password" secureTextEntry maxLength={128} style={styles.input} value={password} onChangeText={setPassword} />
              <TextInput accessibilityLabel="Confirm new password" placeholder="Confirm new password" autoCapitalize="none" autoComplete="new-password" secureTextEntry maxLength={128} style={styles.input} value={confirmation} onChangeText={setConfirmation} />
            </> : <TextInput accessibilityLabel="Recovery email" placeholder="Email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={320} style={styles.input} value={email} onChangeText={setEmail} />}
            <Pressable accessibilityRole="button" accessibilityLabel={reset ? 'Save new password' : 'Send recovery email'} disabled={pending || (reset ? password.length < 12 || !confirmation : !email.trim())} style={styles.button} onPress={() => void submit()}>
              {pending ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>{reset ? 'Save new password' : 'Send recovery email'}</Text>}
            </Pressable>
          </>}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {reset && !message && <Link href="/forgot-password" replace style={styles.link}>Request a new recovery link</Link>}
        <Link href="/sign-in" replace style={styles.link}>Back to sign in</Link>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f6f7f9' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 18 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  title: { fontSize: 32, fontWeight: '800' },
  description: { fontSize: 15, lineHeight: 22, opacity: 0.8 },
  input: { backgroundColor: '#ffffff', borderColor: '#d9dde3', borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16 },
  button: { backgroundColor: '#111827', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  error: { color: '#b42318', lineHeight: 22 },
  link: { fontSize: 15, fontWeight: '700', paddingVertical: 8 },
});
