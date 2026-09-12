import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Switch, Text, View } from '../../ui/primitives';
import { useAuth } from '../../auth/AuthProvider';
import { runSessionWork } from '../../auth/sessionWork';
import { serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';
import { requestFinancialNotificationPermission } from '../../notifications/nativeNotifications';
import { DEFAULT_NOTIFICATIONS, type NotificationKind, type NotificationPreferences } from '../../notifications/notificationPolicy';
import { getNotificationState, refreshFinancialNotifications, saveNotificationPreferences } from '../../notifications/notificationService';
import { useOnlineSync } from '../../sync/OnlineSyncProvider';

const LABELS: Record<NotificationKind, string> = { upcoming: 'Upcoming subscriptions', budget: 'Budget thresholds (80% / 100%)', anomaly: 'Unusual spending', forecast: 'Forecast changes' };
export function NotificationSettings() {
  const db = useSQLiteContext();
  const { user } = useAuth();
  const { hasNetwork } = useOnlineSync();
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATIONS);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getNotificationState(db).then((value) => { if (active) setPreferences(value); })
      .catch(() => { if (active) setError('Unable to load notification preferences'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [db]);
  const save = async (next: NotificationPreferences) => {
    setBusy(true); setError(null);
    try {
      await runSessionWork(async () => {
        if (next.enabled) await requestFinancialNotificationPermission();
        await saveNotificationPreferences(db, next);
        setPreferences(next);
        if (next.enabled && user && hasNetwork) await refreshFinancialNotifications(db, user.id);
      });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update notifications'); }
    finally { setBusy(false); }
  };
  return <View style={s.card}>
    <View style={[s.row, { alignItems: 'center', justifyContent: 'space-between' }]}><Text style={s.sectionTitle}>Notifications</Text>
      <Switch accessibilityLabel="Enable notifications" value={preferences.enabled} disabled={busy} onValueChange={(enabled) => void save({ ...preferences, enabled })} /></View>
    <Text style={s.body}>Reminders hide financial details unless you enable them below. Subscription reminders arrive around 9 am the day before a payment is expected.</Text>
    {preferences.enabled ? (Object.entries(LABELS) as [NotificationKind, string][]).map(([kind, label]) => <View style={[s.row, { alignItems: 'center' }]} key={kind}>
      <Text style={[s.body, { flex: 1 }]}>{label}</Text><Switch accessibilityLabel={label} value={preferences.kinds[kind]} disabled={busy}
        onValueChange={(value) => void save({ ...preferences, kinds: { ...preferences.kinds, [kind]: value } })} />
    </View>) : null}
    {preferences.enabled ? <View style={[s.row, { alignItems: 'center' }]}><Text style={[s.body, { flex: 1 }]}>Show amounts and merchants</Text>
      <Switch accessibilityLabel="Show financial notification details" value={preferences.showDetails ?? false} disabled={busy} onValueChange={(showDetails) => void save({ ...preferences, showDetails })} />
    </View> : null}
    <Text style={s.metadata}>New alerts are checked when the app syncs, including background sync when Android allows it. Scheduled reminders work offline. Battery settings may delay delivery.</Text>
    {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
  </View>;
}
