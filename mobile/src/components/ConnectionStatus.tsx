import { ActivityIndicator, Pressable, StyleSheet, Text, View } from '../ui/primitives';

import { useOnlineSync } from '../sync/OnlineSyncProvider';

export function ConnectionStatus({
  onRefresh, refreshing = false,
}: { onRefresh?: () => void; refreshing?: boolean }) {
  const sync = useOnlineSync();
  const pending = sync.health.queued + sync.health.sending;
  const attention = sync.health.failed + sync.health.conflicts;
  const busy = sync.isSyncing || refreshing;
  const label = { online: 'Online', offline: 'Offline mode',
    checking: 'Connecting…', unavailable: 'Server unavailable' }[sync.mode];
  const detail = busy ? 'Updating your account…'
    : attention ? `${attention} change${attention === 1 ? '' : 's'} need attention`
      : pending ? `${pending} change${pending === 1 ? '' : 's'} waiting to sync`
        : sync.mode === 'offline' ? 'Your saved data is available. Changes sync when you reconnect.'
          : sync.mode === 'unavailable' ? 'Your saved data is available. Try refreshing shortly.'
            : sync.error ? 'Updates are incomplete. Refresh to try again.'
              : sync.lastSyncedAt ? 'All changes synchronized' : 'Checking for your latest data…';

  return (
    <View style={styles.panel}>
      <View style={styles.copy}>
        <View style={styles.heading}>
          <View style={[styles.dot, sync.mode === 'online' && styles.online]} />
          <Text accessibilityRole="header" style={styles.label}>{label}</Text>
        </View>
        <Text style={styles.detail}>{detail}</Text>
        {sync.lastSyncedAt ? (
          <Text style={styles.time}>Last sync: {new Date(sync.lastSyncedAt).toLocaleString()}</Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Refresh account"
        disabled={busy}
        onPress={onRefresh ?? (() => { void sync.syncNow().catch(() => undefined); })}
        style={[styles.button, busy && styles.disabled]}
      >
        {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Refresh</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, gap: 12,
    flexDirection: 'row', alignItems: 'center' },
  copy: { flex: 1, gap: 5 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d97706' },
  online: { backgroundColor: '#15803d' },
  label: { fontSize: 14, fontWeight: '800' },
  detail: { fontSize: 12, lineHeight: 18, color: '#475569' },
  time: { fontSize: 11, color: '#64748b' },
  button: { backgroundColor: '#111827', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10 },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  disabled: { opacity: 0.55 },
});
