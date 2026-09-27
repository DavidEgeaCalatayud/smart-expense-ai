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
  ])('classifies pending card operations as holds: %s', (text) => {
    const parsed = parsePaymentNotification(candidate({
      notificationKey: `hold-${text}`,
      title: 'Movimiento de tarjeta',
      text,
    }));
    expect(parsed.kind).toBe('hold');
  });

  it('recognizes refunds and incoming transfers', () => {
    expect(parsePaymentNotification(candidate({
      notificationKey: 'refund-1',
      title: 'Reembolso',
      text: 'Has recibido un reembolso de 8,50 € en MERCADONA',
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
