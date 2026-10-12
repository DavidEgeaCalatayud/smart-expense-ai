import { StyleSheet, Text, View } from '../ui/primitives';
import { ActionPressable } from '../ui/ActionPressable';
import { Button } from '../ui/Button';
import { StatusPill } from '../ui/StatusPill';
import { uiTokens } from '../ui/tokens';

import { useOnlineSync } from '../sync/OnlineSyncProvider';

export function ConnectionStatus({
  onRefresh, refreshing = false,
}: { onRefresh?: () => void; refreshing?: boolean }) {
  const sync = useOnlineSync();
  const pending = sync.health.queued + sync.health.sending;
  const attention = sync.health.failed + sync.health.conflicts;
  const busy = sync.isSyncing || refreshing;
  const healthy = sync.mode === 'online' && !busy && attention === 0 && pending === 0 && !sync.error;

  const refresh = onRefresh ?? (() => { void sync.syncNow().catch(() => undefined); });

  if (healthy) {
    return (
      <ActionPressable
        accessibilityRole="button"
        accessibilityLabel="Sincronizado. Pulsa para actualizar."
        haptic="none"
        onPress={refresh}
        style={styles.compact}
      >
        <StatusPill label="Sincronizado" tone="success" />
      </ActionPressable>
    );
  }

  const label = {
    online: 'Sincronizando',
    offline: 'Modo sin conexión',
    checking: 'Conectando…',
    unavailable: 'Servidor no disponible',
  }[sync.mode];

  const detail = busy ? 'Actualizando tus datos…'
    : attention ? `${attention} cambio${attention === 1 ? '' : 's'} necesita${attention === 1 ? '' : 'n'} atención`
      : pending ? `${pending} cambio${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'} de sincronizar`
        : sync.mode === 'offline' ? 'Puedes seguir usando tus datos guardados. Los cambios se enviarán cuando recuperes conexión.'
          : sync.mode === 'unavailable' ? 'Tus datos guardados siguen disponibles. Inténtalo de nuevo dentro de unos instantes.'
            : sync.error ? 'La actualización no se completó. Puedes volver a intentarlo.'
              : 'Comprobando los datos más recientes…';

  return (
    <View style={styles.panel}>
      <View style={styles.copy}>
        <View style={styles.heading}>
          <View style={[styles.dot, sync.mode === 'online' && styles.online]} />
          <Text accessibilityRole="header" style={styles.label}>{label}</Text>
        </View>
        <Text style={styles.detail}>{detail}</Text>
        {sync.lastSyncedAt ? (
          <Text style={styles.time}>Última sincronización: {new Date(sync.lastSyncedAt).toLocaleString('es-ES')}</Text>
        ) : null}
      </View>
      <Button
        label="Actualizar"
        accessibilityLabel="Actualizar datos"
        haptic="selection"
        disabled={busy}
        loading={busy}
        onPress={refresh}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  compact: {
    minHeight: uiTokens.touchTarget,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  panel: {
    backgroundColor: uiTokens.color.surface,
    borderRadius: uiTokens.radius.lg,
    padding: 14,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  copy: { flex: 1, gap: 5 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d97706' },
  online: { backgroundColor: uiTokens.color.success },
  label: { fontSize: 14, fontWeight: '800' },
  detail: { fontSize: 12, lineHeight: 18, color: '#475569' },
  time: { fontSize: 11, color: '#64748b' },
  button: { minWidth: 96 },
});
