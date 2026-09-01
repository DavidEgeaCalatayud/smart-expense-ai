import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

import { runKeyedTransaction } from '../src/database/keyedTransaction';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : [];
  });
}

describe('SQLCipher keyed transactions', () => {
  it('keeps the task on the supplied keyed connection and commits atomically', async () => {
    const calls: string[] = [];
    const db = {
      execAsync: jest.fn(async (sql: string) => {
        calls.push(sql);
      }),
    };

    const value = await runKeyedTransaction(db as never, async (transaction) => {
      expect(transaction).toBe(db);
      calls.push('TASK');
      return 42;
    });

    expect(value).toBe(42);
    expect(calls).toEqual(['BEGIN IMMEDIATE', 'TASK', 'COMMIT']);
  });

  it('rolls back on the same keyed connection and preserves the original failure', async () => {
    const calls: string[] = [];
    const db = {
      execAsync: jest.fn(async (sql: string) => {
        calls.push(sql);
      }),
    };
    const failure = new Error('write failed');

    await expect(
      runKeyedTransaction(db as never, async () => {
        calls.push('TASK');
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(calls).toEqual(['BEGIN IMMEDIATE', 'TASK', 'ROLLBACK']);
  });

  it('does not allow runtime source to reopen writes through Expo exclusive transactions', () => {
    const sourceRoot = join(__dirname, '..', 'src');
    const offenders = sourceFiles(sourceRoot).filter((file) =>
      /\.withExclusiveTransactionAsync\s*\(/.test(readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });
});
