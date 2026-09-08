import { SyncCoordinator } from '../src/sync/SyncCoordinator';
import { pauseAndDrainSessionWork, resumeSessionWork, runSessionWork } from '../src/auth/sessionWork';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('online synchronization scheduling', () => {
  it('coalesces concurrent requests and runs again for an edit arriving during a pull', async () => {
    const first = deferred();
    let active = 0;
    let maximum = 0;
    const run = jest.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      if (run.mock.calls.length === 1) await first.promise;
      active -= 1;
    });
    const coordinator = new SyncCoordinator(run, () => true);
    const initial = coordinator.request();
    await Promise.resolve();
    const edited = coordinator.request();
    const focused = coordinator.request();
    first.resolve();
    await Promise.all([initial, edited, focused]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(maximum).toBe(1);
  });

  it('makes no request offline and resumes pending work when connectivity returns', async () => {
    let online = false;
    const run = jest.fn(async () => undefined);
    const coordinator = new SyncCoordinator(run, () => online);
    await coordinator.request();
    expect(run).not.toHaveBeenCalled();
    online = true;
    await coordinator.request();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('allows a failed request to be retried without overlapping the old run', async () => {
    const run = jest.fn().mockRejectedValueOnce(new Error('Server unavailable')).mockResolvedValue(undefined);
    const coordinator = new SyncCoordinator(run, () => true);
    await expect(coordinator.request()).rejects.toThrow('Server unavailable');
    await expect(coordinator.request()).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('account isolation with requests in flight', () => {
  afterEach(() => resumeSessionWork());
  it('waits for the final cache/replica write and rejects new work before an account wipe', async () => {
    resumeSessionWork();
    const response = deferred();
    const events: string[] = [];
    const task = runSessionWork(async () => {
      await response.promise;
      events.push('write old account cache');
    });
    const closing = pauseAndDrainSessionWork().then(() => { events.push('wipe'); });
    await expect(runSessionWork(async () => 'late request')).rejects.toThrow('session is closing');
    expect(events).toEqual([]);
    response.resolve();
    await Promise.all([task, closing]);
    expect(events).toEqual(['write old account cache', 'wipe']);
  });
});
