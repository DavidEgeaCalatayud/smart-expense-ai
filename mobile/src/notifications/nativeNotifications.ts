import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
export const FINANCIAL_CHANNEL = 'financial-reminders';
export async function requestFinancialNotificationPermission() {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(FINANCIAL_CHANNEL, {
    name: 'Financial reminders', importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.SECRET,
  });
  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Notifications are disabled in Android settings. Allow notifications for Smart Expense AI and try again.');
}
export async function clearFinancialNotifications() {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.dismissAllNotificationsAsync();
  await Notifications.clearLastNotificationResponseAsync();
}
