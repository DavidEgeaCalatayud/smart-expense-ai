import type { ObservedPaymentEventRow } from './types';

export function paymentEventIgnoreError(event: ObservedPaymentEventRow): string | null {
  if (event.status === 'applied') {
    return 'Este movimiento ya fue aplicado y no se puede ignorar.';
  }
  if (event.transaction_id) {
    return 'Este movimiento ya creó una transacción. Reintenta el ajuste de saldo en lugar de ignorarlo.';
  }
  return null;
}
