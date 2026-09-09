type Listener = (reachable: boolean) => void;
const listeners = new Set<Listener>();

export function reportServerReachability(reachable: boolean): void {
  listeners.forEach((listener) => listener(reachable));
}

export function subscribeServerReachability(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
