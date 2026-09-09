import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { runSessionWork } from '../auth/sessionWork';
import { useOnlineSync } from '../sync/OnlineSyncProvider';
import { refreshFinancialNotifications } from './notificationService';

export function NotificationObserver() {
  const db = useSQLiteContext();
  const { user, isSubmitting } = useAuth();
  const { revision, hasNetwork } = useOnlineSync();
  const router = useRouter();
  useEffect(() => {
    Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });
    if (!user) return;
    let active = true;
    const seen = new Set<string>();
    const receive = (response: Notifications.NotificationResponse | null) => {
      if (!active || !response) return;
      const request = response.notification.request;
      const { route, account } = request.content.data ?? {};
      if (seen.has(request.identifier) || account !== user.id) return;
      seen.add(request.identifier);
      if (route === '/predictions' || route === '/budgets' || route === '/intelligence') router.push(route);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };
    const listener = Notifications.addNotificationResponseReceivedListener(receive);
    void Notifications.getLastNotificationResponseAsync().then(receive).catch(() => undefined);
    return () => { active = false; listener.remove(); };
  }, [router, user]);
  useEffect(() => {
    if (user && !isSubmitting && hasNetwork && revision > 0) {
      void runSessionWork(() => refreshFinancialNotifications(db, user.id)).catch(() => undefined);
    }
  }, [db, hasNetwork, isSubmitting, revision, user]);
  return null;
}
