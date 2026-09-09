import type { CategoryUpsertMutation, TransactionUpsertMutation } from '@smart-expense-ai/api-contracts';
import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { runKeyedTransaction } from '../../database/keyedTransaction';
import type { LocalCategoryRow } from '../../database/types';
import { enqueueMutation } from '../../sync/outboxRepository';
import {
  type OfflineTransactionFormInput,
  validateOfflineTransactionInput,
} from './validation';

export interface CreatedOfflineTransaction {
  transactionId: string;
  categoryId: string;
}

export async function createOfflineTransaction(
  db: SQLiteDatabase,
  input: OfflineTransactionFormInput,
): Promise<CreatedOfflineTransaction> {
  const validated = validateOfflineTransactionInput(input);
  const now = new Date().toISOString();
  const transactionId = Crypto.randomUUID();
  let categoryId = '';

  await runKeyedTransaction(db, async (txn) => {
    categoryId = await resolveTransactionCategory(txn, validated, now);

    await txn.runAsync(
      `INSERT INTO transactions (
         id, merchant, description, category_id, amount_minor, currency,
         transaction_date, transaction_type, payment_method, is_recurring,
         source, server_version, sync_status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, 'manual', NULL, 'pending', ?, ?)`,
      transactionId,
      validated.merchant,
      validated.description,
      categoryId,
      validated.amountMinor,
      validated.transactionDate,
      validated.transactionType,
      validated.paymentMethod,
      validated.isRecurring ? 1 : 0,
      now,
      now,
    );

    const transactionMutation: TransactionUpsertMutation = {
      mutationId: Crypto.randomUUID(),
      entityId: transactionId,
      entityType: 'transaction',
      operation: 'upsert',
      baseVersion: null,
      clientOccurredAt: now,
      payload: {
        merchant: validated.merchant,
        description: validated.description,
        categoryId,
        amount: minorUnitsToDecimal(validated.amountMinor),
        currency: 'EUR',
        transactionDate: validated.transactionDate,
        transactionType: validated.transactionType,
        paymentMethod: validated.paymentMethod,
        isRecurring: validated.isRecurring,
        source: 'manual',
      },
    };
    await enqueueMutation(txn, transactionMutation, now);
  });

  return { transactionId, categoryId };
}

export async function resolveTransactionCategory(
  txn: SQLiteDatabase,
  validated: ReturnType<typeof validateOfflineTransactionInput>,
  now: string,
  allowArchivedId?: string,
): Promise<string> {
  let categoryId = '';
    const selected = validated.categoryId ? await txn.getFirstAsync<LocalCategoryRow>(
      'SELECT * FROM categories WHERE id = ?', validated.categoryId,
    ) : null;
    if (validated.categoryId && (!selected || selected.transaction_type !== validated.transactionType ||
      (selected.archived === 1 && selected.id !== allowArchivedId))) {
      throw new Error('Choose an available category for this transaction type');
    }
    const existingCategory = selected ?? await txn.getFirstAsync<LocalCategoryRow>(
      `SELECT * FROM categories
       WHERE normalized_name = ? AND transaction_type = ? AND archived = 0
       LIMIT 1`,
      validated.normalizedCategoryName,
      validated.transactionType,
    );

    if (existingCategory) {
      categoryId = existingCategory.id;
    } else {
      categoryId = Crypto.randomUUID();
      await txn.runAsync(
        `INSERT INTO categories (
           id, name, normalized_name, transaction_type, system_category, archived,
           server_version, sync_status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 0, 0, NULL, 'pending', ?, ?)`,
        categoryId,
        validated.categoryName,
        validated.normalizedCategoryName,
        validated.transactionType,
        now,
        now,
      );

      const categoryMutation: CategoryUpsertMutation = {
        mutationId: Crypto.randomUUID(),
        entityId: categoryId,
        entityType: 'category',
        operation: 'upsert',
        baseVersion: null,
        clientOccurredAt: now,
        payload: {
          name: validated.categoryName,
          transactionType: validated.transactionType,
          systemCategory: false,
          archived: false,
        },
      };
      await enqueueMutation(txn, categoryMutation, now);
    }

  return categoryId;
}
