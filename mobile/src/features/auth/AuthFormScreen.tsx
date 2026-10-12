import { Link } from '../../ui/Link';
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
} from '../../ui/primitives';
import Ionicons from '../../ui/Icon';
import { ActionPressable } from '../../ui/ActionPressable';
import { uiTokens } from '../../ui/tokens';

import { useAuth } from '../../auth/AuthProvider';
import { E2eLegacyMigrationDiagnostic } from './E2eLegacyMigrationDiagnostic';

interface AuthFormScreenProps {
  mode: 'login' | 'register';
}

export function AuthFormScreen({ mode }: AuthFormScreenProps) {
  const { login, register, isSubmitting, error, clearError } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const isRegister = mode === 'register';
  const passwordLongEnough = password.length >= 12;

  const submit = async () => {
    clearError();
    try {
      if (isRegister) await register(email, password, displayName);
      else await login(email, password);
    } catch {
      // El provider mantiene el error visible.
    }
  };

  const disabled =
    isSubmitting ||
    !email.trim() ||
    !password ||
    (isRegister && (!displayName.trim() || !passwordLongEnough));

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>SMART EXPENSE AI</Text>
            <Text style={styles.title}>{isRegister ? 'Crear cuenta' : 'Bienvenido de nuevo'}</Text>
            <Text style={styles.subtitle}>
              {isRegister
                ? 'Una sola cuenta para gestionar tus finanzas desde el móvil y la web.'
                : 'Accede a tus finanzas y sigue trabajando incluso cuando no tengas conexión.'}
            </Text>
          </View>

          {!isRegister ? <E2eLegacyMigrationDiagnostic /> : null}

          <View style={styles.form}>
            {isRegister ? (
              <TextInput
                accessibilityLabel="Display name"
                autoFocus
                autoCapitalize="words"
                autoComplete="name"
                maxLength={120}
                onChangeText={setDisplayName}
                placeholder="Nombre"
                style={styles.input}
                value={displayName}
              />
            ) : null}
            <TextInput
              accessibilityLabel="Email"
              autoFocus={!isRegister}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Correo electrónico"
              style={styles.input}
              value={email}
            />
            <View style={styles.passwordWrap}>
              <TextInput
                accessibilityLabel="Password"
                autoCapitalize="none"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                maxLength={128}
                onChangeText={setPassword}
                placeholder={isRegister ? 'Contraseña (12+ caracteres)' : 'Contraseña'}
                secureTextEntry={!showPassword}
                style={[styles.input, styles.passwordInput]}
                value={password}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onPress={() => setShowPassword((value) => !value)}
                style={styles.eyeButton}
              >
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={uiTokens.color.muted} />
              </Pressable>
            </View>
            {isRegister ? (
              <Text style={[styles.requirement, passwordLongEnough && styles.requirementOk]}>
                {passwordLongEnough ? '✓' : '○'} Mínimo 12 caracteres
              </Text>
            ) : null}

            {!isRegister ? (
              <Link href="/forgot-password" asChild>
                <Pressable accessibilityLabel="Forgot password link" accessibilityRole="link" disabled={isSubmitting} testID="forgot-password-link">
                  <Text style={styles.linkText}>¿Has olvidado la contraseña?</Text>
                </Pressable>
              </Link>
            ) : null}
            {isSubmitting && !isRegister ? (
              <Text accessibilityLiveRegion="polite" style={styles.subtitle}>Conectando de forma segura…</Text>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <ActionPressable
              accessibilityLabel={isRegister ? 'Submit create account' : 'Submit sign in'}
              accessibilityRole="button"
              haptic="success"
              disabled={disabled}
              onPress={() => void submit()}
              style={[styles.primaryButton, disabled && styles.buttonDisabled]}
            >
              {isSubmitting ? <ActivityIndicator color="#ffffff" /> : (
                <Text style={styles.primaryButtonText}>{isRegister ? 'Crear cuenta' : 'Iniciar sesión'}</Text>
              )}
            </ActionPressable>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>{isRegister ? '¿Ya tienes una cuenta?' : '¿Eres nuevo en Smart Expense AI?'}</Text>
            <Link href={isRegister ? '/sign-in' : '/register'} asChild>
              <Pressable accessibilityRole="link" onPress={clearError}>
                <Text style={styles.linkText}>{isRegister ? 'Iniciar sesión' : 'Crear una'}</Text>
              </Pressable>
            </Link>
          </View>

          <Text style={styles.securityNote}>Tus credenciales se guardan de forma segura en este dispositivo.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: uiTokens.color.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 36 },
  hero: { gap: 10, marginBottom: 30 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.1 },
  title: { fontSize: 36, fontWeight: '800' },
  subtitle: { fontSize: 15, lineHeight: 22, opacity: 0.68 },
  form: { gap: 12 },
  input: {
    backgroundColor: uiTokens.color.surface,
    borderColor: uiTokens.color.border,
    borderRadius: uiTokens.radius.md,
    borderWidth: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 50,
  },
  passwordWrap: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 52 },
  eyeButton: { position: 'absolute', right: 3, width: uiTokens.touchTarget, height: uiTokens.touchTarget, alignItems: 'center', justifyContent: 'center' },
  requirement: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  requirementOk: { color: uiTokens.color.success },
  error: { color: uiTokens.color.danger, fontSize: 14, lineHeight: 20 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: uiTokens.color.text,
    borderRadius: uiTokens.radius.md,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.45 },
  switchRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 22 },
  switchText: { fontSize: 14, opacity: 0.68 },
  linkText: { fontSize: 14, fontWeight: '700', color: uiTokens.color.brand },
  securityNote: { fontSize: 12, lineHeight: 18, marginTop: 30, opacity: 0.5, textAlign: 'center' },
});
