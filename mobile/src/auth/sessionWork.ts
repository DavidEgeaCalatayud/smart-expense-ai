// Drain replica/cache writes before account cleanup so a late response cannot
// restore the previous account's data after sign-out.
let acceptingWork = true;
const pending = new Set<Promise<unknown>>();

export function resumeSessionWork(): void {
  acceptingWork = true;
}

export function isSessionWorkAllowed(): boolean {
  return acceptingWork;
}

export function runSessionWork<T>(operation: () => Promise<T>): Promise<T> {
  if (!acceptingWork) return Promise.reject(new Error('Your session is closing.'));
  const task = Promise.resolve().then(operation);
  pending.add(task);
  void task.then(() => pending.delete(task), () => pending.delete(task));
  return task;
}

export async function pauseAndDrainSessionWork(): Promise<void> {
  acceptingWork = false;
  await Promise.allSettled([...pending]);
}
