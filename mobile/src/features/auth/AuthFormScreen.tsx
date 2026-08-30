import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '../../auth/AuthProvider';

interface AuthFormScreenProps {
  mode: 'login' | 'register';
}

export function AuthFormScreen({ mode }: AuthFormScreenProps) {
  const { login, register, isSubmitting, error, clearError } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isRegister = mode === 'register';

  const submit = async () => {
    clearError();
    try {
      if (isRegister) {
        await register(email, password, displayName);
      } else {
        await login(email, password);
      }
    } catch {
      // The provider owns the user-facing error state.
    }
  };

  const disabled =
    isSubmitting ||
    !email.trim() ||
    !password ||
    (isRegister && !displayName.trim());

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>SMART EXPENSE AI · ANDROID</Text>
            <Text style={styles.title}>{isRegister ? 'Create account' : 'Welcome back'}</Text>
            <Text style={styles.subtitle}>
              {isRegister
                ? 'Your mobile session is secured independently from the web session.'
                : 'Sign in to unlock your offline financial workspace on this device.'}
            </Text>
          </View>

          <View style={styles.form}>
            {isRegister ? (
              <TextInput
                accessibilityLabel="Display name"
                autoCapitalize="words"
                autoComplete="name"
                maxLength={120}
                onChangeText={setDisplayName}
                placeholder="Display name"
                style={styles.input}
                value={displayName}
              />
            ) : null}
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              style={styles.input}
              value={email}
            />
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              maxLength={128}
              onChangeText={setPassword}
              placeholder={isRegister ? 'Password (12+ characters)' : 'Password'}
              secureTextEntry
              style={styles.input}
              value={password}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                disabled && styles.buttonDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isRegister ? 'Create account' : 'Sign in'}
                </Text>
              )}
            </Pressable>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>
              {isRegister ? 'Already have an account?' : 'New to Smart Expense AI?'}
            </Text>
            <Link href={isRegister ? '/sign-in' : '/register'} asChild>
              <Pressable accessibilityRole="link" onPress={clearError}>
                <Text style={styles.linkText}>{isRegister ? 'Sign in' : 'Create one'}</Text>
              </Pressable>
            </Link>
          </View>

          <Text style={styles.securityNote}>
            Access and refresh credentials stay in the device secure store, never in SQLite.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f6f7f9' },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  hero: { gap: 10, marginBottom: 30 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.1 },
  title: { fontSize: 36, fontWeight: '800' },
  subtitle: { fontSize: 15, lineHeight: 22, opacity: 0.68 },
  form: { gap: 12 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d9dde3',
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  error: { color: '#b42318', fontSize: 14, lineHeight: 20 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  buttonPressed: { opacity: 0.82 },
  buttonDisabled: { opacity: 0.45 },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    marginTop: 22,
  },
  switchText: { fontSize: 14, opacity: 0.68 },
  linkText: { fontSize: 14, fontWeight: '700' },
  securityNote: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 30,
    opacity: 0.5,
    textAlign: 'center',
  },
});
