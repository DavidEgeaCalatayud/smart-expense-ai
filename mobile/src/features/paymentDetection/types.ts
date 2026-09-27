export type PaymentDetectionMode = 'notify' | 'confirm' | 'automatic';
export type ObservedPaymentEventKind =
  | 'payment'
  | 'refund'
  | 'transfer_in'
  | 'transfer_out'
  | 'rejected'
  | 'hold'
  | 'unknown';
export type ObservedPaymentStatus =
  | 'pending'
  | 'needs_confirmation'
  | 'balance_pending'
  | 'applied'
  | 'ignored'
  | 'duplicate'
  | 'rejected'
  | 'failed';

export interface PaymentDetectionSettings {
  enabled: boolean;
  mode: PaymentDetectionMode;
  autoConfidence: number;
}

export interface ParsedPaymentNotification {
  sourcePackage: string;
  sourceLabel: string;
  notificationKey: string;
  notificationId: number | null;
  occurredAt: string;
  capturedAt: string;
  title: string;
  body: string;
  merchant: string | null;
  amountMinor: number | null;
  currency: string | null;
  cardHint: string | null;
  kind: ObservedPaymentEventKind;
  parserConfidence: number;
  fingerprint: string | null;
}

export interface ObservedPaymentEventRow {
  id: string;
  source_package: string;
  source_label: string;
  notification_key: string;
  notification_id: number | null;
  occurred_at: string;
  captured_at: string;
  title: string;
  body: string;
  merchant: string | null;
  amount_minor: number | null;
  currency: string | null;
  card_hint: string | null;
  event_kind: ObservedPaymentEventKind;
  financial_account_id: string | null;
  transaction_id: string | null;
  confidence: number;
  status: ObservedPaymentStatus;
  fingerprint: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentAccountMatch {
  accountId: string | null;
  confidence: number;
  reason: string;
}
