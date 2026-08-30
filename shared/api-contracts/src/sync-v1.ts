export const MOBILE_SYNC_PROTOCOL_VERSION = 'sync-v1' as const;

export type MobileSyncProtocolVersion = typeof MOBILE_SYNC_PROTOCOL_VERSION;
export type SyncCursor = string;
export type SyncEntityType = 'transaction' | 'category' | 'budget';
export type SyncChangeOperation = 'upsert' | 'delete';
export type SyncMutationStatus = 'applied' | 'duplicate' | 'conflict' | 'rejected';

export type TransactionType = 'expense' | 'income';
export type PaymentMethod = 'card' | 'cash' | 'bank_transfer' | 'direct_debit';
export type TransactionSource = 'manual' | 'import' | 'bank_api';

export interface TransactionSyncPayload {
  merchant: string;
  description: string;
  categoryId: string;
  amount: string;
  currency: string;
  transactionDate: string;
  transactionType: TransactionType;
  paymentMethod: PaymentMethod;
  isRecurring: boolean;
  source: TransactionSource;
}

export interface CategorySyncPayload {
  name: string;
  transactionType: TransactionType;
  systemCategory: boolean;
  archived: boolean;
}

export interface BudgetSyncPayload {
  categoryId: string | null;
  month: string;
  limitAmount: string;
}

export interface SyncPayloadByEntity {
  transaction: TransactionSyncPayload;
  category: CategorySyncPayload;
  budget: BudgetSyncPayload;
}

interface MutationMetadata {
  mutationId: string;
  entityId: string;
  baseVersion: number | null;
  clientOccurredAt: string;
}

export interface TransactionUpsertMutation extends MutationMetadata {
  entityType: 'transaction';
  operation: 'upsert';
  payload: TransactionSyncPayload;
}

export interface CategoryUpsertMutation extends MutationMetadata {
  entityType: 'category';
  operation: 'upsert';
  payload: CategorySyncPayload;
}

export interface BudgetUpsertMutation extends MutationMetadata {
  entityType: 'budget';
  operation: 'upsert';
  payload: BudgetSyncPayload;
}

export interface DeleteMutation extends MutationMetadata {
  entityType: SyncEntityType;
  operation: 'delete';
  payload?: never;
}

export type SyncMutation =
  | TransactionUpsertMutation
  | CategoryUpsertMutation
  | BudgetUpsertMutation
  | DeleteMutation;

export interface SyncPushRequest {
  protocolVersion: MobileSyncProtocolVersion;
  deviceId: string;
  mutations: SyncMutation[];
}

export interface SyncMutationError {
  code: string;
  message: string;
}

export interface SyncMutationResult {
  mutationId: string;
  entityType: SyncEntityType;
  entityId: string;
  status: SyncMutationStatus;
  serverVersion?: number;
  error?: SyncMutationError;
}

export interface SyncConflict<T extends SyncEntityType = SyncEntityType> {
  mutationId: string;
  entityType: T;
  entityId: string;
  reason: 'stale_version' | 'server_deleted' | 'ownership_or_visibility_changed';
  serverVersion: number | null;
  serverPayload: SyncPayloadByEntity[T] | null;
}

export interface SyncPushResponse {
  protocolVersion: MobileSyncProtocolVersion;
  serverTime: string;
  results: SyncMutationResult[];
  conflicts: SyncConflict[];
}

interface SyncUpsertChangeBase<T extends SyncEntityType> {
  cursor: SyncCursor;
  entityType: T;
  entityId: string;
  operation: 'upsert';
  version: number;
  changedAt: string;
  payload: SyncPayloadByEntity[T];
}

export type TransactionUpsertChange = SyncUpsertChangeBase<'transaction'>;
export type CategoryUpsertChange = SyncUpsertChangeBase<'category'>;
export type BudgetUpsertChange = SyncUpsertChangeBase<'budget'>;

export interface SyncDeleteChange {
  cursor: SyncCursor;
  entityType: SyncEntityType;
  entityId: string;
  operation: 'delete';
  version: number;
  changedAt: string;
  payload: null;
}

export type SyncChange =
  | TransactionUpsertChange
  | CategoryUpsertChange
  | BudgetUpsertChange
  | SyncDeleteChange;

export interface SyncPullPage {
  protocolVersion: MobileSyncProtocolVersion;
  serverTime: string;
  changes: SyncChange[];
  nextCursor: SyncCursor;
  hasMore: boolean;
}

export interface SyncBootstrapPage {
  protocolVersion: MobileSyncProtocolVersion;
  serverTime: string;
  changes: SyncChange[];
  snapshotToken: string;
  nextPageToken: string | null;
  establishedCursor: SyncCursor | null;
}
