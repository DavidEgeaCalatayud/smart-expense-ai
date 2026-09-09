import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createServerDerivedApi } from '../api/serverDerivedApi';
import { readServerCache, writeServerCache } from '../database/serverCacheRepository';
import { loadHomeData } from '../features/home/homeData';
import { localDate } from '../features/transactions/validation';
import { DEFAULT_NOTIFICATIONS, notificationPlan, type NotificationPreferences, type NotificationState } from './notificationPolicy';
import { clearFinancialNotifications, FINANCIAL_CHANNEL } from './nativeNotifications';

const KEY = 'native:notifications:v1';
let queue: Promise<unknown> = Promise.resolve();
let preferenceRevision = 0;
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const task = queue.then(operation, operation);
  queue = task.catch(() => undefined);
  return task;
}
export async function getNotificationState(db: SQLiteDatabase): Promise<NotificationState> {
  return (await readServerCache<NotificationState>(db, KEY))?.value ?? { ...DEFAULT_NOTIFICATIONS, seen: {}, scheduled: {} };
}
export async function saveNotificationPreferences(db: SQLiteDatabase, preferences: NotificationPreferences) {
  preferenceRevision += 1;
  return serial(async () => {
    const previous = await getNotificationState(db);
    const state = { ...previous, enabled: preferences.enabled, showDetails: preferences.showDetails ?? false, kinds: { ...preferences.kinds } };
    if (Boolean(previous.showDetails) !== state.showDetails) {
      await clearFinancialNotifications();
      for (const item of Object.values(state.scheduled)) delete state.seen[item.key];
      state.scheduled = {};
    }
    if (!state.enabled) {
      await clearFinancialNotifications();
      for (const item of Object.values(state.scheduled)) delete state.seen[item.key];
      state.scheduled = {};
    } else {
      for (const [id, item] of Object.entries(state.scheduled)) if (!state.kinds[item.kind]) {
        await Notifications.cancelScheduledNotificationAsync(id); delete state.seen[item.key]; delete state.scheduled[id];
      }
    }
    await writeServerCache(db, KEY, state);
  });
}

// Caller registers the complete operation with runSessionWork so logout drains even headless jobs.
export function refreshFinancialNotifications(db: SQLiteDatabase, userId: string): Promise<void> {
  return serial(async () => {
    const state = await getNotificationState(db);
    if (!state.enabled || !(await Notifications.getPermissionsAsync()).granted) return;
    const revision = preferenceRevision;
    const data = await loadHomeData(createServerDerivedApi(), localDate().slice(0, 7));
    if (revision !== preferenceRevision) return;
    const now = new Date();
    const plan = notificationPlan(data, state, now);
    const desired = new Set(plan.notifications.map((item) => item.key));
    if (data.upcoming) for (const [id, item] of Object.entries(state.scheduled)) {
      if (item.kind === 'upcoming' && !desired.has(item.key)) {
        await Notifications.cancelScheduledNotificationAsync(id); delete state.seen[item.key]; delete state.scheduled[id];
      }
    }
    for (const item of plan.notifications) {
      if (revision !== preferenceRevision) return;
      if (state.seen[item.key]) continue;
      const id = `finance-${await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${userId}:${item.key}`)}`;
      // Record before delivery: a process death must not flood the user on the next refresh.
      state.seen[item.key] = now.toISOString();
      state.scheduled[id] = { key: item.key, kind: item.kind, at: item.at ?? now.toISOString() };
      await writeServerCache(db, KEY, state);
      try {
        await Notifications.scheduleNotificationAsync({ identifier: id,
          content: { title: state.showDetails && item.details ? item.details.title : item.title, body: state.showDetails && item.details ? item.details.body : item.body, data: { route: item.route, account: userId }, sound: false },
          trigger: item.at ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(item.at), channelId: FINANCIAL_CHANNEL }
            : { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, repeats: false, channelId: FINANCIAL_CHANNEL },
        });
      } catch (error) {
        delete state.seen[item.key]; delete state.scheduled[id];
        await writeServerCache(db, KEY, state); throw error;
      }
    }
    state.forecast = plan.forecast;
    state.seen = Object.fromEntries(Object.entries(state.seen).filter(([, date]) => now.getTime() - new Date(date).getTime() < 100 * 86400000).slice(-2000));
    state.scheduled = Object.fromEntries(Object.entries(state.scheduled).filter(([, item]) => new Date(item.at).getTime() > now.getTime()));
    await writeServerCache(db, KEY, state);
  });
}
