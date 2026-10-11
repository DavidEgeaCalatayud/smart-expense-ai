import { decimalToMinorUnits, minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { LocalFinancialAccountPositionRow, LocalFinancialAccountRow } from '../../database/types';
import { updateOfflineFinancialAccountBalanceAtomically } from './offlineFinancialAccountMutations';

const MAX_MINOR = 999_999_999_999;

export interface InvestmentPositionInput {
  id?: string;
  instrumentType: 'cash' | 'fund';
  name: string;
  isin?: string | null;
  invested: string;
  units?: string | null;
  averagePrice?: string | null;
  currentValue: string;
}

function parseMoney(value: string, label: string): number {
  let minor: number;
  try { minor = decimalToMinorUnits(value.trim().replace(',', '.')); }
  catch { throw new Error(`${label}: introduce un importe válido con hasta dos decimales.`); }
  if (minor < 0 || minor > MAX_MINOR) throw new Error(`${label}: importe fuera de rango.`);
  return minor;
}

function parseOptionalMoney(value: string | null | undefined, label: string): number | null {
  const clean = value?.trim() ?? '';
  return clean ? parseMoney(clean, label) : null;
}

function cleanUnits(value: string | null | undefined): string | null {
  const clean = value?.trim().replace(',', '.') ?? '';
  if (!clean) return null;
  const number = Number(clean);
  if (!Number.isFinite(number) || number < 0) throw new Error('Participaciones: introduce un número válido.');
  return clean;
}

function cleanName(value: string): string {
  const clean = value.trim();
  if (!clean) throw new Error('Indica el nombre del fondo.');
  if (clean.length > 180) throw new Error('El nombre del fondo es demasiado largo.');
  return clean;
}

function cleanIsin(value: string | null | undefined): string | null {
  const clean = value?.trim().toUpperCase() ?? '';
  if (!clean) return null;
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(clean)) throw new Error('El ISIN no tiene un formato válido.');
  return clean;
}

export function isMyInvestorAccount(account: LocalFinancialAccountRow): boolean {
  return account.account_type === 'broker'
    && (account.institution ?? '').trim().toLowerCase().replace(/\s+/g, '') === 'myinvestor';
}

export async function listInvestmentPositions(
  db: SQLiteDatabase,
  accountId: string,
): Promise<LocalFinancialAccountPositionRow[]> {
  return db.getAllAsync<LocalFinancialAccountPositionRow>(
    `SELECT * FROM financial_account_positions
     WHERE financial_account_id = ? AND archived = 0
     ORDER BY CASE instrument_type WHEN 'cash' THEN 0 ELSE 1 END, created_at ASC, id ASC`,
    accountId,
  );
}

export async function ensureInvestmentComposition(
  db: SQLiteDatabase,
  account: LocalFinancialAccountRow,
): Promise<void> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM financial_account_positions WHERE financial_account_id = ? AND archived = 0',
    account.id,
  );
  if ((row?.count ?? 0) > 0) return;

  const now = new Date().toISOString();
  const id = `${account.id}:cash`;
  await db.runAsync(
    `INSERT INTO financial_account_positions (
       id, financial_account_id, instrument_type, name, isin, invested_minor,
       units, average_price_minor, current_value_minor, archived, created_at, updated_at
     ) VALUES (?, ?, 'cash', 'Efectivo disponible', NULL, ?, NULL, NULL, ?, 0, ?, ?)`,
    id,
    account.id,
    account.current_balance_minor,
    account.current_balance_minor,
    now,
    now,
  );
  await db.runAsync(
    `INSERT INTO financial_position_snapshots (
       id, position_id, current_value_minor, archived, recorded_at
     ) VALUES (?, ?, ?, 0, ?)`,
    Crypto.randomUUID(),
    id,
    account.current_balance_minor,
    now,
  );
}

export async function saveInvestmentPosition(
  db: SQLiteDatabase,
  accountId: string,
  input: InvestmentPositionInput,
): Promise<string> {
  const existing = await listInvestmentPositions(db, accountId);
  const id = input.instrumentType === 'cash'
    ? `${accountId}:cash`
    : (input.id ?? Crypto.randomUUID());
  const name = input.instrumentType === 'cash' ? 'Efectivo disponible' : cleanName(input.name);
  const isin = input.instrumentType === 'cash' ? null : cleanIsin(input.isin);
  const investedMinor = input.instrumentType === 'cash'
    ? parseMoney(input.currentValue, 'Efectivo')
    : parseMoney(input.invested, 'Importe invertido');
  const currentValueMinor = parseMoney(
    input.currentValue,
    input.instrumentType === 'cash' ? 'Efectivo' : 'Valor actual',
  );
  const units = input.instrumentType === 'cash' ? null : cleanUnits(input.units);
  const averagePriceMinor = input.instrumentType === 'cash'
    ? null
    : parseOptionalMoney(input.averagePrice, 'Precio medio');

  const nextTotal = existing
    .filter((position) => position.id !== id)
    .reduce((sum, position) => sum + position.current_value_minor, 0)
    + currentValueMinor;
  const now = new Date().toISOString();

  await updateOfflineFinancialAccountBalanceAtomically(
    db,
    accountId,
    minorUnitsToDecimal(nextTotal),
    async (txn) => {
      await txn.runAsync(
        `INSERT INTO financial_account_positions (
           id, financial_account_id, instrument_type, name, isin, invested_minor,
           units, average_price_minor, current_value_minor, archived, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           isin = excluded.isin,
           invested_minor = excluded.invested_minor,
           units = excluded.units,
           average_price_minor = excluded.average_price_minor,
           current_value_minor = excluded.current_value_minor,
           archived = 0,
           updated_at = excluded.updated_at`,
        id,
        accountId,
        input.instrumentType,
        name,
        isin,
        investedMinor,
        units,
        averagePriceMinor,
        currentValueMinor,
        now,
        now,
      );
      await txn.runAsync(
        `INSERT INTO financial_position_snapshots (
           id, position_id, current_value_minor, archived, recorded_at
         ) VALUES (?, ?, ?, 0, ?)`,
        Crypto.randomUUID(),
        id,
        currentValueMinor,
        now,
      );
    },
  );
  return id;
}

export async function archiveInvestmentPosition(
  db: SQLiteDatabase,
  accountId: string,
  positionId: string,
): Promise<void> {
  const existing = await listInvestmentPositions(db, accountId);
  const target = existing.find((position) => position.id === positionId);
  if (!target || target.instrument_type === 'cash') return;

  const nextTotal = existing
    .filter((position) => position.id !== positionId)
    .reduce((sum, position) => sum + position.current_value_minor, 0);
  const now = new Date().toISOString();

  await updateOfflineFinancialAccountBalanceAtomically(
    db,
    accountId,
    minorUnitsToDecimal(nextTotal),
    async (txn) => {
      await txn.runAsync(
        'UPDATE financial_account_positions SET archived = 1, updated_at = ? WHERE id = ?',
        now,
        positionId,
      );
      await txn.runAsync(
        `INSERT INTO financial_position_snapshots (
           id, position_id, current_value_minor, archived, recorded_at
         ) VALUES (?, ?, 0, 1, ?)`,
        Crypto.randomUUID(),
        positionId,
        now,
      );
    },
  );
}
