import { createElement, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useCachedServerResource } from '../src/api/useCachedServerResource';
import { MobileApiHttpError } from '../src/api/client';
import { useOnlineSync } from '../src/sync/OnlineSyncProvider';
import { resumeSessionWork } from '../src/auth/sessionWork';
import { readServerCache, writeServerCache } from '../src/database/serverCacheRepository';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => (() => void) | undefined) => {
    jest.requireActual<typeof import('react')>('react').useEffect(effect, [effect]);
  },
}));
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDb }));
jest.mock('../src/sync/OnlineSyncProvider', () => ({ useOnlineSync: jest.fn() }));
jest.mock('../src/database/serverCacheRepository', () => ({
  readServerCache: jest.fn(), writeServerCache: jest.fn(),
}));
const mockDb = { runAsync: jest.fn(async () => undefined) };
const readCache = jest.mocked(readServerCache);
const writeCache = jest.mocked(writeServerCache);
const syncContext = jest.mocked(useOnlineSync);
type Resource = ReturnType<typeof useCachedServerResource<{ total: string }>>;
interface Props { cacheKey: string; loader(): Promise<{ total: string }>; onState(value: Resource): void }
function Probe(props: Props) {
  const value = useCachedServerResource(props.cacheKey, props.loader);
  useEffect(() => { props.onState(value); }, [props, value]);
  return null;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('focused online workspaces and cached fallback', () => {
  let renderer: ReactTestRenderer | undefined;
  const onState = jest.fn<void, [Resource]>();
  const state = () => onState.mock.calls.at(-1)![0];
  const online = (hasNetwork = true, revision = 0) => {
    syncContext.mockReturnValue({ hasNetwork, revision, syncNow: async () => undefined } as never);
  };
  async function render(loader: Props['loader'], cacheKey = 'dashboard') {
    await act(async () => {
      const element = createElement(Probe, { loader, cacheKey, onState });
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });
  }
  beforeEach(() => {
    resumeSessionWork();
    onState.mockClear();
    readCache.mockReset();
    writeCache.mockReset();
    mockDb.runAsync.mockClear();
    readCache.mockResolvedValue(null);
    writeCache.mockResolvedValue(undefined);
    online();
  });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('shows the saved snapshot without contacting the server when offline', async () => {
    online(false);
    readCache.mockResolvedValue({ value: { total: '12.34' }, fetchedAt: '2026-09-01T12:00:00Z' });
    const loader = jest.fn();
    await render(loader);
    expect(loader).not.toHaveBeenCalled();
    expect(state().data).toEqual({ total: '12.34' });
    expect(state().isCachedFallback).toBe(true);
  });

  it('refreshes on reconnect and after a completed account synchronization', async () => {
    online(false);
    const loader = jest.fn().mockResolvedValue({ total: '23.45' });
    await render(loader);
    online(true);
    await render(loader);
    expect(state().data).toEqual({ total: '23.45' });
    expect(state().isCachedFallback).toBe(false);
    loader.mockResolvedValue({ total: '34.56' });
    online(true, 1);
    await render(loader);
    expect(state().data).toEqual({ total: '34.56' });
  });

  it('marks existing data as cached when a later manual refresh fails', async () => {
    const snapshot = { value: { total: '12.34' }, fetchedAt: '2026-09-01T12:00:00Z' };
    readCache.mockResolvedValue(snapshot);
    const loader = jest.fn().mockResolvedValue(snapshot.value);
    await render(loader);
    expect(state().isCachedFallback).toBe(false);
    loader.mockRejectedValue(new TypeError('Network request failed'));
    await act(async () => { await state().refresh().catch(() => undefined); });
    expect(state().data).toEqual(snapshot.value);
    expect(state().isCachedFallback).toBe(true);
    expect(state().error).toContain('Network request failed');
  });

  it('does not use cached premium data after the server denies access', async () => {
    readCache.mockResolvedValue({ value: { total: '12.34' }, fetchedAt: '2026-09-01T12:00:00Z' });
    await render(jest.fn().mockRejectedValue(new MobileApiHttpError(403, 'premium_feature_required', 'Premium required')));
    expect(state().data).toBeNull();
    expect(state().isCachedFallback).toBe(false);
    expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM server_cache WHERE cache_key = ?', 'dashboard');
  });

  it('ignores a late response for the previous month after changing selection', async () => {
    const old = deferred<{ total: string }>();
    await render(() => old.promise, 'reports:2026-08');
    await render(async () => ({ total: '90.00' }), 'reports:2026-09');
    await act(async () => old.resolve({ total: '10.00' }));
    expect(state().data).toEqual({ total: '90.00' });
    expect(writeCache.mock.calls.map((args) => args[1])).toEqual(['reports:2026-09']);
  });
});
