import { Text } from 'react-native';
import { useOnlineSync } from '../sync/OnlineSyncProvider';
import { serverWorkspaceStyles as s } from './ServerWorkspaceShell';

export function DataFreshness({ cachedAt, isCachedFallback }: {
  cachedAt: string | null; isCachedFallback: boolean;
}) {
  const { health, isSyncing } = useOnlineSync();
  if (!cachedAt) return null;
  return <Text style={s.metadata}>
    {isCachedFallback ? 'Saved data' : 'Updated'}: {new Date(cachedAt).toLocaleString()}
    {health.queued + health.sending + health.failed + health.conflicts > 0 || isSyncing
      ? ' · Pending changes may not be included yet.' : ''}
  </Text>;
}
