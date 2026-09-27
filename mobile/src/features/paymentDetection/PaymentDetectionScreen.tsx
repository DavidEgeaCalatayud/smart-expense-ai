import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ServerWorkspaceShell, serverWorkspaceStyles as s } from '../../components/ServerWorkspaceShell';
import { Link } from '../../ui/Link';
import { Pressable, StyleSheet, Switch, Text, View } from '../../ui/primitives';
import { useFinancialAccounts } from '../money/useFinancialAccounts';
import {
  applyObservedPaymentEvent,
  drainNativePaymentCandidates,
  ignoreObservedPaymentEvent,
} from './engine';
import {
  hasPaymentNotificationAccess,
  isPaymentNotificationListenerAvailable,
  openPaymentNotificationAccessSettings,
  setNativePaymentCaptureEnabled,
} from './nativePaymentNotifications';
import { requestPaymentDetectionNotificationPermission } from './paymentDetectionNotifications';
import {
  getPaymentDetectionSettings,
  listObservedPaymentEvents,
  setPaymentDetectionSettings,
} from './repository';
import type {
  ObservedPaymentEventRow,
  PaymentDetectionMode,
  PaymentDetectionSettings,
} from './types';

const MODES: { value: PaymentDetectionMode; title: string; description: string }[] = [
  { value: 'notify', title: 'Solo avisarme', description: 'Detecta el movimiento pero nunca modifica tus datos sin confirmación.' },
  { value: 'confirm', title: 'Confirmar antes de guardar', description: 'Prepara cuenta, importe y comercio para que solo tengas que confirmar.' },
  { value: 'automatic', title: 'Automático con confianza alta', description: 'Crea la transacción y ajusta el saldo solo cuando cuenta, importe y tipo son fiables.' },
];

function formatAmount(event: ObservedPaymentEventRow): string {
  if (event.amount_minor === null || !event.currency) return 'Importe no reconocido';
  const amount = Number(minorUnitsToDecimal(event.amount_minor));
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: event.currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${event.currency}`;
  }
}

function statusLabel(event: ObservedPaymentEventRow): string {
  const labels: Record<ObservedPaymentEventRow['status'], string> = {
    pending: 'Procesando',
    needs_confirmation: 'Confirmar',
    balance_pending: 'Saldo pendiente',
    applied: 'Aplicado',
    ignored: 'Ignorado',
    duplicate: 'Duplicado evitado',
    rejected: 'Pago rechazado',
    failed: 'Revisar',
  };
  return labels[event.status];
}

function kindLabel(event: ObservedPaymentEventRow): string {
  const labels: Record<ObservedPaymentEventRow['event_kind'], string> = {
    payment: 'Pago', refund: 'Reembolso', transfer_in: 'Transferencia recibida',
    transfer_out: 'Transferencia enviada', rejected: 'Pago rechazado', hold: 'Retención', unknown: 'Movimiento',
  };
  return labels[event.event_kind];
}

function isApplicable(event: ObservedPaymentEventRow): boolean {
  return ['payment', 'refund', 'transfer_in', 'transfer_out'].includes(event.event_kind)
    && event.amount_minor !== null
    && event.amount_minor > 0
    && event.currency === 'EUR';
}

export function PaymentDetectionScreen() {
  const db = useSQLiteContext();
  const { accounts, reload: reloadAccounts } = useFinancialAccounts();
  const [settings, setSettings] = useState<PaymentDetectionSettings>({ enabled: false, mode: 'confirm', autoConfidence: 0.85 });
  const [events, setEvents] = useState<ObservedPaymentEventRow[]>([]);
  const [accessGranted, setAccessGranted] = useState(false);
  const [isRefreshing, setRefreshing] = useState(true);
  const [busyEvent, setBusyEvent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<Record<string, string>>({});
  const available = isPaymentNotificationListenerAvailable();

  const accountNames = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.name])),
    [accounts],
  );

  const load = useCallback(async (drain = true) => {
    setRefreshing(true);
    setError(null);
    try {
      if (drain) await drainNativePaymentCandidates(db).catch(() => 0);
      const [nextSettings, nextEvents, access] = await Promise.all([
        getPaymentDetectionSettings(db),
        listObservedPaymentEvents(db, 40),
        hasPaymentNotificationAccess(),
      ]);
      setSettings(nextSettings);
      setEvents(nextEvents);
      setAccessGranted(access);
      setSelectedAccounts((current) => {
        const next = { ...current };
        for (const event of nextEvents) {
          if (!next[event.id] && event.financial_account_id) next[event.id] = event.financial_account_id;
        }
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cargar la detección de pagos.');
    } finally {
      setRefreshing(false);
    }
  }, [db]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const saveSettings = useCallback(async (next: PaymentDetectionSettings) => {
    setError(null);
    try {
      if (next.enabled) {
        // Posting Smart Expense alerts is optional: detection itself still works when denied.
        await requestPaymentDetectionNotificationPermission().catch(() => false);
      }
      await setPaymentDetectionSettings(db, next);
      await setNativePaymentCaptureEnabled(next.enabled);
      setSettings(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar la configuración.');
    }
  }, [db]);

  const grantAccess = useCallback(async () => {
    await openPaymentNotificationAccessSettings().catch(() => false);
  }, []);

  const applyEvent = useCallback(async (event: ObservedPaymentEventRow) => {
    const accountId = selectedAccounts[event.id] ?? event.financial_account_id ?? undefined;
    setBusyEvent(event.id);
    setError(null);
    try {
      await applyObservedPaymentEvent(db, event.id, accountId, true);
      await Promise.all([load(false), reloadAccounts()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo aplicar el movimiento.');
      await load(false);
    } finally {
      setBusyEvent(null);
    }
  }, [db, load, reloadAccounts, selectedAccounts]);

  const ignoreEvent = useCallback(async (eventId: string) => {
    setBusyEvent(eventId);
    try {
      await ignoreObservedPaymentEvent(db, eventId);
      await load(false);
    } finally {
      setBusyEvent(null);
    }
  }, [db, load]);

  const reviewable = events.filter((event) => ['needs_confirmation', 'balance_pending', 'failed'].includes(event.status));
  const recent = events.filter((event) => !reviewable.includes(event)).slice(0, 12);

  return (
    <ServerWorkspaceShell active="money" title="Pagos automáticos"
      subtitle="Detecta pagos de Wallet y apps bancarias sin conectar directamente tu banco."
      isRefreshing={isRefreshing} onRefresh={() => void load()}>
      <Link href="/" asChild>
        <Pressable style={s.secondaryButton}><Text style={s.secondaryButtonText}>← Volver a Mi dinero</Text></Pressable>
      </Link>

      {!available ? <View style={s.card}>
        <Text style={s.cardTitle}>Disponible en Android nativo</Text>
        <Text style={s.body}>Esta función necesita la APK instalada. Expo Go y otras plataformas no exponen NotificationListenerService.</Text>
      </View> : null}

      <View style={s.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={s.cardTitle}>Detectar movimientos</Text>
            <Text style={s.metadata}>Solo se conservan notificaciones que parecen movimientos financieros; códigos OTP y contraseñas se descartan en la capa nativa.</Text>
          </View>
          <Switch value={settings.enabled} onValueChange={(enabled) => void saveSettings({ ...settings, enabled })} />
        </View>
        <View style={styles.permissionRow}>
          <Text style={accessGranted ? styles.good : styles.warning}>{accessGranted ? '✓ Acceso a notificaciones concedido' : 'Acceso a notificaciones pendiente'}</Text>
          {!accessGranted ? <Pressable style={s.secondaryButton} onPress={() => void grantAccess()}>
            <Text style={s.secondaryButtonText}>Dar acceso</Text>
          </Pressable> : null}
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Comportamiento</Text>
        {MODES.map((mode) => {
          const active = settings.mode === mode.value;
          return <Pressable key={mode.value} onPress={() => void saveSettings({ ...settings, mode: mode.value })}
            style={[s.card, active && styles.modeActive]}>
            <Text style={s.cardTitle}>{active ? '● ' : '○ '}{mode.title}</Text>
            <Text style={s.metadata}>{mode.description}</Text>
          </Pressable>;
        })}
      </View>

      {error ? <Text style={s.error}>{error}</Text> : null}

      <View style={s.section}>
        <Text style={s.sectionTitle}>Por confirmar</Text>
        {reviewable.length === 0 ? <Text style={s.empty}>No hay movimientos pendientes.</Text> : reviewable.map((event) => {
          const selectedAccount = selectedAccounts[event.id] ?? event.financial_account_id ?? '';
          const applicable = isApplicable(event);
          return <View key={event.id} style={s.card}>
            <View style={styles.eventTop}>
              <View style={styles.eventCopy}>
                <Text style={s.cardTitle}>{event.merchant || event.source_label}</Text>
                <Text style={s.metadata}>{kindLabel(event)} · {event.source_label} · {statusLabel(event)}</Text>
              </View>
              <Text style={styles.amount}>{formatAmount(event)}</Text>
            </View>
            {event.card_hint ? <Text style={s.metadata}>Tarjeta {event.card_hint}</Text> : null}
            <Text style={s.metadata}>Confianza {Math.round(event.confidence * 100)}%</Text>
            {event.error_message ? <Text style={s.error}>{event.error_message}</Text> : null}
            {!applicable ? <Text style={styles.warning}>Se ha detectado para revisión, pero no se modificará el saldo automáticamente.</Text> : null}

            {applicable ? <>
              <Text style={styles.accountLabel}>Cuenta</Text>
              <View style={styles.accountChoices}>
                {accounts.map((account) => {
                  const active = account.id === selectedAccount;
                  return <Pressable key={account.id}
                    onPress={() => setSelectedAccounts((current) => ({ ...current, [event.id]: account.id }))}
                    style={[styles.accountChip, active && styles.accountChipActive]}>
                    <Text style={[styles.accountChipText, active && styles.accountChipTextActive]}>{account.name}</Text>
                  </Pressable>;
                })}
              </View>
            </> : null}

            <View style={styles.actions}>
              {applicable ? <Pressable disabled={busyEvent === event.id || !selectedAccount}
                onPress={() => void applyEvent(event)} style={[s.primaryButton, styles.flexButton, (!selectedAccount || busyEvent === event.id) && styles.disabled]}>
                <Text style={s.primaryButtonText}>{event.status === 'balance_pending' ? 'Reintentar saldo' : 'Confirmar'}</Text>
              </Pressable> : null}
              <Pressable disabled={busyEvent === event.id} onPress={() => void ignoreEvent(event.id)}
                style={[s.secondaryButton, styles.flexButton]}>
                <Text style={s.secondaryButtonText}>Ignorar</Text>
              </Pressable>
            </View>
          </View>;
        })}
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Actividad detectada</Text>
        {recent.length === 0 ? <Text style={s.empty}>Todavía no se han detectado movimientos.</Text> : recent.map((event) => (
          <View key={event.id} style={s.card}>
            <View style={styles.eventTop}>
              <View style={styles.eventCopy}>
                <Text style={s.cardTitle}>{event.merchant || event.source_label}</Text>
                <Text style={s.metadata}>{event.source_label} · {statusLabel(event)}</Text>
              </View>
              <Text style={styles.amount}>{formatAmount(event)}</Text>
            </View>
            {event.financial_account_id ? <Text style={s.metadata}>{accountNames.get(event.financial_account_id) ?? 'Cuenta archivada'} · Detectado automáticamente</Text> : null}
          </View>
        ))}
      </View>
    </ServerWorkspaceShell>
  );
}

const styles = StyleSheet.create({
  settingRow: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  settingCopy: { flex: 1, gap: 5 },
  permissionRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginTop: 8 },
  good: { color: '#17765a', flex: 1, fontSize: 13, fontWeight: '700' },
  warning: { color: '#9a6700', flex: 1, fontSize: 13, fontWeight: '700' },
  modeActive: { borderColor: '#65a58f', borderWidth: 2 },
  eventTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  eventCopy: { flex: 1, gap: 4 },
  amount: { fontSize: 18, fontWeight: '900' },
  accountLabel: { fontSize: 12, fontWeight: '800', marginTop: 7 },
  accountChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  accountChip: { borderColor: '#c9ced6', borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 },
  accountChipActive: { backgroundColor: '#dff3e9', borderColor: '#65a58f' },
  accountChipText: { fontSize: 12, fontWeight: '700' },
  accountChipTextActive: { color: '#125c47' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 7 },
  flexButton: { flex: 1 },
  disabled: { opacity: 0.45 },
});
