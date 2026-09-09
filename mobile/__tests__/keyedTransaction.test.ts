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
  it('serializes a local edit against a concurrent sync transaction on the keyed connection', async () => {
    const calls: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const db = { execAsync: jest.fn(async (sql: string) => { calls.push(sql); }) };
    const sync = runKeyedTransaction(db as never, async () => {
      calls.push('SYNC');
      await pending;
    });
    await Promise.resolve();
    await Promise.resolve();
    const edit = runKeyedTransaction(db as never, async () => { calls.push('EDIT'); });
    expect(calls.filter((call) => call === 'BEGIN IMMEDIATE')).toHaveLength(1);
    release();
    await Promise.all([sync, edit]);
    expect(calls).toEqual(['BEGIN IMMEDIATE', 'SYNC', 'COMMIT', 'BEGIN IMMEDIATE', 'EDIT', 'COMMIT']);
  });

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
