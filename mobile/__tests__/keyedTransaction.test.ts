import { runKeyedTransaction } from '../src/database/keyedTransaction';

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
}

const fs = jest.requireActual<{
  readdirSync(directory: string, options: { withFileTypes: true }): DirectoryEntry[];
  readFileSync(path: string, encoding: 'utf8'): string;
}>('fs');
const pathApi = jest.requireActual<{
  extname(path: string): string;
  join(...paths: string[]): string;
}>('path');

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = pathApi.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return ['.ts', '.tsx'].includes(pathApi.extname(entry.name)) ? [path] : [];
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
    const offenders = sourceFiles('src').filter((file) =>
      /\.withExclusiveTransactionAsync\s*\(/.test(fs.readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });
});
