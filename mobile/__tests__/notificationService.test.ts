import * as Notifications from 'expo-notifications';
import { loadHomeData, type HomeData } from '../src/features/home/homeData';
import { DEFAULT_NOTIFICATIONS, type NotificationState } from '../src/notifications/notificationPolicy';
import { refreshFinancialNotifications, saveNotificationPreferences } from '../src/notifications/notificationService';

jest.mock('../src/api/serverDerivedApi', () => ({ createServerDerivedApi: jest.fn(() => ({})) }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(async () => ({ granted: true })), scheduleNotificationAsync: jest.fn(async () => 'id'), cancelScheduledNotificationAsync: jest.fn(async () => undefined), cancelAllScheduledNotificationsAsync: jest.fn(async () => undefined), dismissAllNotificationsAsync: jest.fn(async () => undefined), clearLastNotificationResponseAsync: jest.fn(async () => undefined), SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' } }));
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA256' }, digestStringAsync: jest.fn(async (_algorithm, text) => text) }));
jest.mock('../src/features/home/homeData', () => ({ ...jest.requireActual('../src/features/home/homeData'), loadHomeData: jest.fn() }));
const data: HomeData = { summary: null, monthly: null, budgets: null, forecast: null, findings: null, partial: false,
  upcoming: { upcomingPayments: [{ streamKey: 'stream', merchant: 'Subscription', expectedAmount: '12.99', expectedDate: '2099-09-11' }] } as HomeData['upcoming'] };
function database() {
  let state: NotificationState = { ...DEFAULT_NOTIFICATIONS, enabled: true, seen: {}, scheduled: {} };
  return { get state() { return state; },
    getFirstAsync: jest.fn(async () => ({ payload_json: JSON.stringify(state), fetched_at: '2026-09-09' })),
    runAsync: jest.fn(async (_sql: string, _key: string, payload: string) => { state = JSON.parse(payload) as NotificationState; }),
  };
}
beforeEach(() => { jest.clearAllMocks(); jest.mocked(loadHomeData).mockResolvedValue(data); });
it('keeps financial details private by default and replaces pending reminders when the preference changes', async () => {
  const db = database();
  await refreshFinancialNotifications(db as never, 'account-a');
  const first = jest.mocked(Notifications.scheduleNotificationAsync).mock.calls[0]![0].content;
  expect(`${first.title} ${first.body}`).not.toContain('12.99');
  expect(first.title).toBe('Upcoming subscription');
  await saveNotificationPreferences(db as never, { enabled: true, kinds: DEFAULT_NOTIFICATIONS.kinds, showDetails: true });
  await refreshFinancialNotifications(db as never, 'account-a');
  expect(jest.mocked(Notifications.scheduleNotificationAsync).mock.calls[1]![0].content.title).toContain('12.99');
  await saveNotificationPreferences(db as never, { enabled: true, kinds: DEFAULT_NOTIFICATIONS.kinds, showDetails: false });
  await refreshFinancialNotifications(db as never, 'account-a');
  expect(jest.mocked(Notifications.scheduleNotificationAsync).mock.calls[2]![0].content.title).toBe('Upcoming subscription');
  expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(2);
  expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalledTimes(2);
});
it('deduplicates repeated syncs and reschedules future reminders after opt-out and opt-in', async () => {
  const db = database();
  await refreshFinancialNotifications(db as never, 'account-a');
  await refreshFinancialNotifications(db as never, 'account-a');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  await saveNotificationPreferences(db as never, { enabled: false, kinds: DEFAULT_NOTIFICATIONS.kinds });
  expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  await saveNotificationPreferences(db as never, { enabled: true, kinds: DEFAULT_NOTIFICATIONS.kinds });
  await refreshFinancialNotifications(db as never, 'account-a');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
});
it('preserves deduplication history when a settings screen saves an older snapshot', async () => {
  const db = database();
  const old = db.state;
  await refreshFinancialNotifications(db as never, 'account-a');
  await saveNotificationPreferences(db as never, old);
  await refreshFinancialNotifications(db as never, 'account-a');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});
it('cancels reminders that disappeared from a fresh server projection', async () => {
  const db = database();
  await refreshFinancialNotifications(db as never, 'account-a');
  jest.mocked(loadHomeData).mockResolvedValue({ ...data, upcoming: { ...data.upcoming!, upcomingPayments: [] } });
  await refreshFinancialNotifications(db as never, 'account-a');
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  expect(db.state.scheduled).toEqual({});
});
it('does not schedule after opt-out while a server response is still pending', async () => {
  const db = database();
  let resolve!: (value: HomeData) => void;
  let started!: () => void;
  const entered = new Promise<void>((done) => { started = done; });
  jest.mocked(loadHomeData).mockImplementation(() => { started(); return new Promise((done) => { resolve = done; }); });
  const loading = refreshFinancialNotifications(db as never, 'account-a');
  await entered;
  const disabling = saveNotificationPreferences(db as never, { enabled: false, kinds: DEFAULT_NOTIFICATIONS.kinds });
  resolve(data);
  await Promise.all([loading, disabling]);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  expect(db.state.enabled).toBe(false);
});
