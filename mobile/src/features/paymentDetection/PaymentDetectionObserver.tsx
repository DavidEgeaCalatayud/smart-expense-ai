import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { drainNativePaymentCandidates } from './engine';
import { setNativePaymentCaptureEnabled } from './nativePaymentNotifications';
import { getPaymentDetectionSettings } from './repository';

export function PaymentDetectionObserver() {
  const db = useSQLiteContext();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    let active = true;

    const reconcile = async () => {
      if (!user) {
        await setNativePaymentCaptureEnabled(false).catch(() => undefined);
        return;
      }
      const settings = await getPaymentDetectionSettings(db);
      if (!active) return;
      await setNativePaymentCaptureEnabled(settings.enabled).catch(() => undefined);
      if (settings.enabled) {
        await drainNativePaymentCandidates(db).catch(() => undefined);
      }
    };

    void reconcile();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcile();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [db, isLoading, user]);

  return null;
}
