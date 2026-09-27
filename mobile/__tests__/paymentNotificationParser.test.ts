import { parsePaymentNotification } from '../src/features/paymentDetection/parser';
import type { NativePaymentNotificationCandidate } from '../src/features/paymentDetection/nativePaymentNotifications';

function candidate(overrides: Partial<NativePaymentNotificationCandidate> = {}): NativePaymentNotificationCandidate {
  return {
    sourcePackage: 'com.example.bank',
    sourceLabel: 'Bankinter',
    notificationKey: 'key-1',
    notificationId: 7,
    occurredAt: Date.parse('2026-09-27T18:42:00Z'),
    capturedAt: Date.parse('2026-09-27T18:42:01Z'),
    title: 'Compra con tarjeta',
    text: 'Has realizado una compra de 18,40 € en MERCADONA con tu tarjeta terminada en 1234',
    category: 'status',
    locale: 'es-ES',
    ...overrides,
  };
}

describe('payment notification parser', () => {
  it('extracts a Spanish bank card payment, merchant and card hint', () => {
    const parsed = parsePaymentNotification(candidate());
    expect(parsed.amountMinor).toBe(1840);
    expect(parsed.currency).toBe('EUR');
    expect(parsed.kind).toBe('payment');
    expect(parsed.merchant).toBe('MERCADONA');
    expect(parsed.cardHint).toBe('••••1234');
    expect(parsed.parserConfidence).toBeGreaterThanOrEqual(0.9);
  });

  it('does not mistake the card suffix for the merchant when it appears first', () => {
    const parsed = parsePaymentNotification(candidate({
      notificationKey: 'suffix-before-merchant',
      text: 'Compra de 18,40 € con tu tarjeta terminada en 1234 en MERCADONA',
    }));
    expect(parsed.amountMinor).toBe(1840);
    expect(parsed.merchant).toBe('MERCADONA');
    expect(parsed.cardHint).toBe('••••1234');
  });

  it('parses Wallet-style amount-before-currency notifications', () => {
    const parsed = parsePaymentNotification(candidate({
      sourcePackage: 'com.google.android.apps.walletnfcrel',
      sourceLabel: 'Google Wallet',
      notificationKey: 'wallet-1',
      title: 'MERCADONA',
      text: 'Paid €18.40 with Visa •••• 1234',
    }));
    expect(parsed.amountMinor).toBe(1840);
    expect(parsed.currency).toBe('EUR');
    expect(parsed.kind).toBe('payment');
    expect(parsed.merchant).toBe('MERCADONA');
  });

  it('keeps sparse Wallet notifications for safe manual review', () => {
    const parsed = parsePaymentNotification(candidate({
      sourcePackage: 'com.google.android.apps.walletnfcrel',
      sourceLabel: 'Google Wallet',
      notificationKey: 'wallet-sparse-1',
      title: 'MERCADONA',
      text: '18,40 € · Visa •••• 1234',
    }));
    expect(parsed.amountMinor).toBe(1840);
    expect(parsed.currency).toBe('EUR');
    expect(parsed.kind).toBe('unknown');
    expect(parsed.cardHint).toBe('••••1234');
  });

  it('keeps card balance and limit notices review-only even when they contain an amount', () => {
    const balance = parsePaymentNotification(candidate({
      notificationKey: 'card-balance-1',
      title: 'Tu tarjeta',
      text: 'Saldo disponible de tu tarjeta: 500,00 €',
    }));
    const limit = parsePaymentNotification(candidate({
      notificationKey: 'card-limit-1',
      title: 'Límite de tarjeta',
      text: 'Tu tarjeta tiene un límite disponible de 1.200,00 €',
    }));
    expect(balance.amountMinor).toBe(50000);
    expect(balance.kind).toBe('unknown');
    expect(limit.amountMinor).toBe(120000);
    expect(limit.kind).toBe('unknown');
  });

  it.each([
    ['Saldo disponible €500,00. Compra de €20,00 en MERCADONA', 2000],
    ['Compra de 20,00 € en MERCADONA. Saldo disponible 480,00 €', 2000],
    ['Balance available $900.00. Card payment $21.46 at TEST MERCHANT', 2146],
  ])('selects the transaction amount instead of a displayed balance: %s', (text, expectedMinor) => {
    const parsed = parsePaymentNotification(candidate({
      notificationKey: `multi-amount-${text}`,
      title: 'Movimiento de tarjeta',
      text,
    }));
    expect(parsed.amountMinor).toBe(expectedMinor);
    expect(parsed.kind).toBe('payment');
  });

  it.each([
    'Has gastado 500,00 € este mes con tu tarjeta',
    'Gasto mensual: 350,00 €',
    'Spent this month: €420.00',
    'Monthly spend: €275.50',
  ])('keeps aggregate spending summaries review-only: %s', (text) => {
    const parsed = parsePaymentNotification(candidate({
      notificationKey: `summary-${text}`,
      title: 'Resumen mensual',
      text,
    }));
    expect(parsed.amountMinor).not.toBeNull();
    expect(parsed.kind).toBe('unknown');
  });

  it('classifies rejected payments without treating them as successful expenses', () => {
    const parsed = parsePaymentNotification(candidate({
      notificationKey: 'rejected-1',
      title: 'Pago rechazado',
      text: 'Pago de 12,00 € rechazado por el comercio',
    }));
    expect(parsed.amountMinor).toBe(1200);
    expect(parsed.kind).toBe('rejected');
  });

  it.each([
    'Pago pendiente de contabilizar de 50,00 € en CEPSA',
    'Compra pendiente de 30,00 € en HOTEL TEST',
    'Pending payment of €12.00 at TEST STORE',
    'Autoriza esta compra de 50,00 € en MERCADONA',
    'Confirma el pago de 22,90 € en AMAZON',
    'Esta operación de 75,00 € necesita tu autorización',
    'Confirm this purchase of €19.95 at TEST STORE',
    'Payment of €31.00 requires your approval',
  ])('classifies pending or approval-required card operations as holds: %s', (text) => {
    const parsed = parsePaymentNotification(candidate({
      notificationKey: `hold-${text}`,
      title: 'Movimiento de tarjeta',
      text,
    }));
    expect(parsed.kind).toBe('hold');
  });

  it('does not confuse a completed authorized-payment message with an approval request', () => {
    const parsed = parsePaymentNotification(candidate({
      notificationKey: 'authorized-completed',
      title: 'Pago realizado',
      text: 'Pago autorizado de 14,50 € en CAFETERIA TEST',
    }));
    expect(parsed.kind).toBe('payment');
  });

  it('recognizes refunds, reversed charges and incoming transfers', () => {
    expect(parsePaymentNotification(candidate({
      notificationKey: 'refund-1',
      title: 'Reembolso',
      text: 'Has recibido un reembolso de 8,50 € en MERCADONA',
    })).kind).toBe('refund');
    expect(parsePaymentNotification(candidate({
      notificationKey: 'reversed-charge-es',
      title: 'Movimiento actualizado',
      text: 'Cargo devuelto de 18,40 € en MERCADONA',
    })).kind).toBe('refund');
    expect(parsePaymentNotification(candidate({
      notificationKey: 'reversed-charge-en',
      title: 'Card update',
      text: 'Charge reversed: €18.40 at MERCADONA',
    })).kind).toBe('refund');
    expect(parsePaymentNotification(candidate({
      notificationKey: 'bizum-1',
      title: 'Bizum recibido',
      text: 'Has recibido 25,00 € por Bizum',
    })).kind).toBe('transfer_in');
    expect(parsePaymentNotification(candidate({
      notificationKey: 'bizum-common-in',
      title: 'Bizum',
      text: 'Te han hecho un Bizum de 30,00 €',
    })).kind).toBe('transfer_in');
    expect(parsePaymentNotification(candidate({
      notificationKey: 'bizum-common-out',
      title: 'Bizum',
      text: 'Has hecho un Bizum de 15,00 €',
    })).kind).toBe('transfer_out');
  });

  it('does not classify generic received-notification wording as incoming money', () => {
    const parsed = parsePaymentNotification(candidate({
      notificationKey: 'received-notice-not-transfer',
      title: 'Aviso',
      text: 'Has recibido un aviso sobre un pago de 50,00 €',
    }));
    expect(parsed.kind).not.toBe('transfer_in');
  });

  it('keeps non-EUR currency explicit so the engine cannot auto-adjust an EUR account', () => {
    const parsed = parsePaymentNotification(candidate({
      notificationKey: 'usd-1',
      sourceLabel: 'eToro',
      title: 'Card payment',
      text: 'Paid $21.46 at TEST MERCHANT',
    }));
    expect(parsed.amountMinor).toBe(2146);
    expect(parsed.currency).toBe('USD');
  });
});
