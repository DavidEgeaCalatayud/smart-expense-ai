import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../auth/AuthProvider';
import { WorkspaceNav } from '../../components/WorkspaceNav';
import { serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';

export function AccountScreen() {
  const { user, deleteAccount, isSubmitting } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canDelete = password.length > 0 && confirmation === 'DELETE' && !isSubmitting;

  async function removeAccount() {
    setError(null);
    try {
      await deleteAccount(password, confirmation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete your account. Check your connection and try again.');
    } finally {
      setPassword('');
      setConfirmation('');
    }
  }

  function confirmDeletion() {
    if (!canDelete) return;
    Alert.alert('Permanently delete your account?',
      'Your account and associated financial data will be deleted. Pending changes on this device will also be discarded. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete account', style: 'destructive', onPress: () => void removeAccount() },
      ]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <WorkspaceNav active="account" />
        <Text style={styles.title}>Account</Text>
        <Text style={s.body}>{user?.email}</Text>
        <View style={s.card}>
          <Text style={s.sectionTitle}>Delete account and data</Text>
          <Text style={s.body}>This permanently deletes your account and its financial records from the service, and clears this device. An internet connection is required.</Text>
          <Text style={s.body}>To continue, enter your current password and type DELETE.</Text>
          <TextInput accessibilityLabel="Current password" placeholder="Current password" secureTextEntry
            autoCapitalize="none" autoCorrect={false} maxLength={128} editable={!isSubmitting}
            value={password} onChangeText={setPassword} style={s.input} />
          <TextInput accessibilityLabel="Deletion confirmation" placeholder="Type DELETE" autoCapitalize="characters"
            autoCorrect={false} editable={!isSubmitting} value={confirmation} onChangeText={setConfirmation} style={s.input} />
          {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={!canDelete} onPress={confirmDeletion}
            style={[s.primaryButton, styles.deleteButton, !canDelete && styles.disabled]}>
            {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryButtonText}>Delete account and data</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f6f7f9' },
  content: { gap: 18, padding: 20, paddingBottom: 40 },
  title: { fontSize: 30, fontWeight: '800' },
  deleteButton: { backgroundColor: '#b42318' },
  disabled: { opacity: 0.5 },
});
