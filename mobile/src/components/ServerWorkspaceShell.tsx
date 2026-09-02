import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../auth/AuthProvider';
import { WorkspaceNav, type WorkspaceName } from './WorkspaceNav';

export function ServerWorkspaceShell({
  active,
  title,
  subtitle,
  isRefreshing,
  onRefresh,
  children,
}: {
  active: WorkspaceName;
  title: string;
  subtitle: string;
  isRefreshing: boolean;
  onRefresh(): void;
  children: ReactNode;
}) {
  const { user, logout, isSubmitting } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.accountRow}>
          <View style={styles.accountIdentity}>
            <Text style={styles.eyebrow}>SMART EXPENSE AI · MOBILE</Text>
            <Text style={styles.accountName}>{user?.displayName}</Text>
            <Text style={styles.accountEmail}>{user?.email}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting || isRefreshing}
            onPress={() => void logout()}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
              (isSubmitting || isRefreshing) && styles.disabled,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Sign out</Text>
          </Pressable>
        </View>

        <WorkspaceNav active={active} />

        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={isRefreshing}
            onPress={onRefresh}
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && styles.pressed,
              isRefreshing && styles.disabled,
            ]}
          >
            {isRefreshing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.refreshButtonText}>Refresh</Text>
            )}
          </Pressable>
        </View>

        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export const serverWorkspaceStyles = StyleSheet.create({
  section: { gap: 10 },
  sectionTitle: { fontSize: 19, fontWeight: '800' },
  card: { backgroundColor: '#ffffff', borderRadius: 14, gap: 6, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardValue: { fontSize: 24, fontWeight: '800' },
  metadata: { fontSize: 13, lineHeight: 19, opacity: 0.65 },
  body: { fontSize: 14, lineHeight: 21 },
  row: { flexDirection: 'row', gap: 10 },
  rowCard: { backgroundColor: '#ffffff', borderRadius: 14, flex: 1, gap: 4, padding: 14 },
  error: { color: '#b42318', fontSize: 14, lineHeight: 20 },
  empty: { fontSize: 14, lineHeight: 21, opacity: 0.65 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#c9ced6',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d9dde3',
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
});

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#f6f7f9', flex: 1 },
  content: { gap: 18, padding: 20, paddingBottom: 40 },
  accountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
  },
  accountIdentity: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  accountName: { fontSize: 16, fontWeight: '700' },
  accountEmail: { fontSize: 12, opacity: 0.6 },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  titleCopy: { flex: 1, gap: 7 },
  title: { fontSize: 30, fontWeight: '800' },
  subtitle: { fontSize: 15, lineHeight: 22, opacity: 0.7 },
  refreshButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    minWidth: 78,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  refreshButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  secondaryButton: {
    borderColor: '#c9ced6',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  secondaryButtonText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.5 },
});
