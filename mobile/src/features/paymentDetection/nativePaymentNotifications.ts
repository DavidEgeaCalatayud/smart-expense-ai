import { NativeModules, Platform } from 'react-native';

export interface NativePaymentNotificationCandidate {
  sourcePackage: string;
  sourceLabel: string;
  notificationKey: string;
  notificationId: number | null;
  occurredAt: number;
  capturedAt: number;
  title: string;
  text: string;
  category: string;
  locale: string;
}

interface NativePaymentNotificationModule {
  isNotificationAccessGranted(): Promise<boolean>;
  openNotificationAccessSettings(): Promise<boolean>;
  setCaptureEnabled(enabled: boolean): Promise<boolean>;
  isCaptureEnabled(): Promise<boolean>;
  getPendingCandidates(): Promise<string>;
  acknowledgeCandidate(notificationKey: string): Promise<boolean>;
}

const nativeModule = Platform.OS === 'android'
  ? (NativeModules.PaymentNotification as NativePaymentNotificationModule | undefined)
  : undefined;

function moduleOrNull(): NativePaymentNotificationModule | null {
  return nativeModule ?? null;
}

export function isPaymentNotificationListenerAvailable(): boolean {
  return Platform.OS === 'android' && moduleOrNull() !== null;
}

export async function hasPaymentNotificationAccess(): Promise<boolean> {
  return await moduleOrNull()?.isNotificationAccessGranted() ?? false;
}

export async function openPaymentNotificationAccessSettings(): Promise<boolean> {
  return await moduleOrNull()?.openNotificationAccessSettings() ?? false;
}

export async function setNativePaymentCaptureEnabled(enabled: boolean): Promise<boolean> {
  return await moduleOrNull()?.setCaptureEnabled(enabled) ?? false;
}

export async function isNativePaymentCaptureEnabled(): Promise<boolean> {
  return await moduleOrNull()?.isCaptureEnabled() ?? false;
}

export function parseNativePaymentNotificationCandidate(value: unknown): NativePaymentNotificationCandidate | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.sourcePackage !== 'string'
    || typeof candidate.sourceLabel !== 'string'
    || typeof candidate.notificationKey !== 'string'
    || typeof candidate.occurredAt !== 'number'
    || typeof candidate.capturedAt !== 'number'
    || typeof candidate.title !== 'string'
    || typeof candidate.text !== 'string'
  ) return null;
  return {
    sourcePackage: candidate.sourcePackage,
    sourceLabel: candidate.sourceLabel,
    notificationKey: candidate.notificationKey,
    notificationId: typeof candidate.notificationId === 'number' ? candidate.notificationId : null,
    occurredAt: candidate.occurredAt,
    capturedAt: candidate.capturedAt,
    title: candidate.title,
    text: candidate.text,
    category: typeof candidate.category === 'string' ? candidate.category : '',
    locale: typeof candidate.locale === 'string' ? candidate.locale : '',
  };
}

export async function getPendingPaymentNotificationCandidates(): Promise<NativePaymentNotificationCandidate[]> {
  const raw = await moduleOrNull()?.getPendingCandidates();
  if (!raw) return [];
  try {
    const values = JSON.parse(raw) as unknown;
    if (!Array.isArray(values)) return [];
    return values
      .map(parseNativePaymentNotificationCandidate)
      .filter((value): value is NativePaymentNotificationCandidate => value !== null);
  } catch {
    return [];
  }
}

export async function acknowledgePaymentNotificationCandidate(notificationKey: string): Promise<void> {
  if (!notificationKey) return;
  await moduleOrNull()?.acknowledgeCandidate(notificationKey);
}
