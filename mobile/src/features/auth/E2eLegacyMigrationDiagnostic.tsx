import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const LEGACY_MIGRATION_COMPLETION_TABLE = '__smart_expense_sqlcipher_plaintext_migration_v1';
const LEGACY_MIGRATION_PROBE_MERCHANT = 'Legacy Migration Probe';
const E2E_DIAGNOSTIC_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_E2E_MODE === '1';

interface CountRow {
  count: number;
}

interface UserVersionRow {
  user_version: number;
}

export function E2eLegacyMigrationDiagnostic() {
  const db = useSQLiteContext();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!E2E_DIAGNOSTIC_ENABLED) {
      return;
    }

    let cancelled = false;
    void (async () => {
      const [marker, probe, version] = await Promise.all([
        db.getFirstAsync<CountRow>(
          `SELECT COUNT(*) AS count
             FROM sqlite_master
            WHERE type = 'table' AND name = ?`,
          LEGACY_MIGRATION_COMPLETION_TABLE,
        ),
        db.getFirstAsync<CountRow>(
          'SELECT COUNT(*) AS count FROM transactions WHERE merchant = ?',
          LEGACY_MIGRATION_PROBE_MERCHANT,
        ),
        db.getFirstAsync<UserVersionRow>('PRAGMA user_version'),
      ]);

      if (!cancelled) {
        setVerified(
          (marker?.count ?? 0) === 1 &&
            (probe?.count ?? 0) === 1 &&
            (version?.user_version ?? 0) === 2,
        );
      }
    })().catch(() => {
      if (!cancelled) {
        setVerified(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [db]);

  if (!E2E_DIAGNOSTIC_ENABLED || !verified) {
    return null;
  }

  return (
    <View accessibilityLabel="Legacy migration verified" style={styles.container}>
      <Text style={styles.title}>Legacy migration verified</Text>
      <Text style={styles.detail}>Legacy Migration Probe · schema v2 · SQLCipher marker present</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderColor: '#b7bdc8',
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    marginBottom: 16,
    padding: 12,
  },
  title: { fontSize: 13, fontWeight: '700' },
  detail: { fontSize: 12, lineHeight: 17, opacity: 0.68 },
});
