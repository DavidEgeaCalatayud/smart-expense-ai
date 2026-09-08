import { useEffect, useRef } from 'react';

import { useOnlineSync } from './OnlineSyncProvider';

// Screens observe one shared account sync; inline callbacks never start a
// second engine or cancel the first refresh during a render.
export function useForegroundSync(onApplied?: () => Promise<void> | void) {
  const sync = useOnlineSync();
  const callback = useRef(onApplied);
  useEffect(() => { callback.current = onApplied; }, [onApplied]);
  useEffect(() => {
    void Promise.resolve(callback.current?.()).catch(() => undefined);
  }, [sync.revision]);
  return sync;
}
