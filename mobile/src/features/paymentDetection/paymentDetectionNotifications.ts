import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const PAYMENT_DETECTION_CHANNEL = 'detected-payments';

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(PAYMENT_DETECTION_CHANNEL, {
    name: 'Detected payments',
    description: 'Private alerts for payments detected from Wallet or banking notifications.',
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.SECRET,
  });
}

export async function requestPaymentDetectionNotificationPermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function showDetectedPaymentNotification(input: {
  userId: string;
  eventId: string;
  title: string;
  body: string;
}): Promise<void> {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      data: {
        route: '/payment-detection',
        account: input.userId,
        paymentEventId: input.eventId,
      },
    },
    trigger: null,
  });
}
