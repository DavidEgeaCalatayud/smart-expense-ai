import { decimalToMinorUnits } from '@smart-expense-ai/domain-types';

import type { NativePaymentNotificationCandidate } from './nativePaymentNotifications';
import type { ObservedPaymentEventKind, ParsedPaymentNotification } from './types';

const REJECTED = /rechazad|denegad|declined|payment failed|pago fallid|no se ha podido|could not be completed/i;
const HOLD = /retenci[oó]n|preautoriz|pre-autoriz|authorization hold|pending card verification|verificaci[oó]n de tarjeta|(?:pago|compra|operaci[oó]n|transacci[oó]n) pendiente|pendiente de (?:contabilizar|confirmaci[oó]n|autorizar)|pending (?:payment|purchase|transaction)|(?:autoriza(?:r)?|confirma(?:r)?|aprueba|aprobar)\b\s+(?:esta\s+|la\s+|el\s+)?(?:compra|operaci[oó]n|pago|transacci[oó]n)|(?:compra|operaci[oó]n|pago|transacci[oó]n)\b[^!?\n]{0,80}\b(?:requiere|necesita)\s+(?:tu\s+)?(?:autorizaci[oó]n|confirmaci[oó]n)|(?:approve|confirm)\b\s+(?:this\s+|the\s+)?(?:payment|purchase|transaction)|(?:payment|purchase|transaction)\b[^!?\n]{0,80}\b(?:requires|needs)\s+(?:your\s+)?(?:approval|confirmation)/i;
const REFUND = /reembolso|devoluci[oó]n|refund|refunded|reintegr|cargo\s+(?:devuelt|revertid)|(?:charge|payment)\s+reversed|reversed\s+charge/i;
const TRANSFER_IN = /bizum recibido|has recibido|te han enviado|te ha enviado|te han hecho un bizum|has recibido un bizum|transferencia recibida|received (?:a )?transfer|money received/i;
const TRANSFER_OUT = /bizum enviado|has enviado|has hecho un bizum|transferencia enviada|sent (?:a )?transfer|money sent/i;
// A card/wallet mention or an aggregate spending notice is not enough evidence for one purchase.
// Keep those candidates review-only. Automatic payment classification requires an explicit
// transaction word that refers to an individual charge/purchase/payment.
const PAYMENT = /pago|pagado|compra|purchase|paid|payment|cargo|charged/i;
const SPENDING_SUMMARY = /(?:has\s+gastado|gasto\s+(?:total|mensual|semanal)|gastos?\s+(?:del|de este|esta)\s+(?:mes|semana)|spent\s+(?:this|last)\s+(?:month|week)|monthly\s+spend|weekly\s+spend)/i;
const GENERIC_TITLE = /^(pago|payment|compra|purchase|operaci[oó]n|movimiento|wallet|tarjeta|card|notificaci[oó]n|aviso)(\s+realizad[oa])?$/i;

function currencyCode(token: string): string | null {
  const normalized = token.trim().toUpperCase();
  if (normalized === '€' || normalized === 'EUR') return 'EUR';
  if (normalized === '$' || normalized === 'USD') return 'USD';
  if (normalized === '£' || normalized === 'GBP') return 'GBP';
  return null;
}

function normalizeAmountToken(value: string): string | null {
  const compact = value.replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(compact)) return null;
  const comma = compact.lastIndexOf(',');
  const dot = compact.lastIndexOf('.');
  const decimalIndex = Math.max(comma, dot);
  if (decimalIndex < 0) return compact;

  const decimals = compact.length - decimalIndex - 1;
  if (decimals < 1 || decimals > 2) {
    return compact.replace(/[.,]/g, '');
  }
  const integer = compact.slice(0, decimalIndex).replace(/[.,]/g, '');
  const fraction = compact.slice(decimalIndex + 1);
  return `${integer}.${fraction}`;
}

function extractAmount(text: string): { amountMinor: number; currency: string } | null {
  const before = /(?:^|\s)(€|EUR|USD|\$|GBP|£)\s*(\d[\d., ]{0,18})/i.exec(text);
  const after = /(\d[\d., ]{0,18})\s*(€|EUR|USD|\$|GBP|£)(?:\s|$|[).,;:])/i.exec(text);
  const currency = currencyCode(before?.[1] ?? after?.[2] ?? '');
  const amountToken = before?.[2] ?? after?.[1];
  if (!currency || !amountToken) return null;
  const normalized = normalizeAmountToken(amountToken.trim());
  if (!normalized) return null;
  try {
    const amountMinor = decimalToMinorUnits(normalized);
    if (amountMinor <= 0 || amountMinor > 999_999_999_999) return null;
    return { amountMinor, currency };
  } catch {
    return null;
  }
}

function normalizeMerchant(value: string): string | null {
  const clean = value
    .replace(/[•*]{2,}\s*\d{4}.*/g, '')
    .replace(/\b(?:con|using|desde|from)\s+(?:tu\s+)?(?:tarjeta|card).*/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:,-]+|[\s:,-]+$/g, '')
    .trim();
  if (clean.length < 2 || clean.length > 120) return null;
  if (/^\d{4}(?:\b|\s)/.test(clean)) return null;
  if (/^(?:tu\s+)?(?:tarjeta|card)\b/i.test(clean)) return null;
  return clean;
}

function locationMerchantCandidates(text: string): string[] {
  // Split instead of taking only the first "en/at/to" occurrence. Banking apps commonly
  // produce phrases such as "tarjeta terminada en 1234 en MERCADONA" where the first
  // location token belongs to the card suffix, not the merchant.
  const pieces = text.split(/\b(?:en|at|to)\b/i).slice(1);
  return pieces.map((piece) => piece.split(/[.;\n]/, 1)[0] ?? '');
}

function extractMerchant(title: string, body: string): string | null {
  const combined = `${title}. ${body}`;
  const labeled = /(?:comercio|merchant|establecimiento)\s*[:\-]\s*([^.;\n]{2,90})/i.exec(combined);
  if (labeled?.[1]) {
    const merchant = normalizeMerchant(labeled[1]);
    if (merchant) return merchant;
  }

  for (const candidate of locationMerchantCandidates(combined)) {
    const merchant = normalizeMerchant(candidate);
    if (merchant) return merchant;
  }

  const titleClean = normalizeMerchant(title);
  if (titleClean && !GENERIC_TITLE.test(titleClean) && !/[€$£]|\b(?:EUR|USD|GBP)\b/i.test(titleClean)) {
    return titleClean;
  }
  return null;
}

function extractCardHint(text: string): string | null {
  const patterns = [
    /(?:terminad[ao]\s+en|ending\s+in|finalizada?\s+en|tarjeta|card)[^\d]{0,12}(\d{4})\b/i,
    /(?:[•*xX]\s*){2,}(\d{4})\b/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return `••••${match[1]}`;
  }
  return null;
}

function classifyKind(text: string): ObservedPaymentEventKind {
  if (REJECTED.test(text)) return 'rejected';
  if (HOLD.test(text)) return 'hold';
  if (REFUND.test(text)) return 'refund';
  if (TRANSFER_IN.test(text)) return 'transfer_in';
  if (TRANSFER_OUT.test(text)) return 'transfer_out';
  if (SPENDING_SUMMARY.test(text)) return 'unknown';
  if (PAYMENT.test(text)) return 'payment';
  return 'unknown';
}

function fingerprint(
  amountMinor: number | null,
  currency: string | null,
  kind: ObservedPaymentEventKind,
  merchant: string | null,
  cardHint: string | null,
  occurredAtMs: number,
): string | null {
  if (amountMinor === null || !currency) return null;
  const normalizedMerchant = merchant?.toLocaleLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, '') ?? '';
  const bucket = Math.floor(occurredAtMs / (5 * 60_000));
  return [amountMinor, currency, kind, normalizedMerchant, cardHint ?? '', bucket].join('|');
}

export function parsePaymentNotification(
  candidate: NativePaymentNotificationCandidate,
): ParsedPaymentNotification {
  const body = candidate.text.trim();
  const title = candidate.title.trim();
  const combined = `${title} ${body}`.trim();
  const amount = extractAmount(combined);
  const kind = classifyKind(combined);
  const merchant = extractMerchant(title, body);
  const cardHint = extractCardHint(combined);

  let confidence = 0;
  if (amount) confidence += 0.45;
  if (kind !== 'unknown') confidence += 0.15;
  if (merchant) confidence += 0.2;
  if (cardHint) confidence += 0.15;
  if (candidate.sourceLabel && candidate.sourceLabel !== candidate.sourcePackage) confidence += 0.05;
  confidence = Math.min(1, Number(confidence.toFixed(2)));

  const occurredAtMs = Number.isFinite(candidate.occurredAt) ? candidate.occurredAt : Date.now();
  const capturedAtMs = Number.isFinite(candidate.capturedAt) ? candidate.capturedAt : Date.now();
  return {
    sourcePackage: candidate.sourcePackage,
    sourceLabel: candidate.sourceLabel,
    notificationKey: candidate.notificationKey,
    notificationId: candidate.notificationId,
    occurredAt: new Date(occurredAtMs).toISOString(),
    capturedAt: new Date(capturedAtMs).toISOString(),
    title,
    body,
    merchant,
    amountMinor: amount?.amountMinor ?? null,
    currency: amount?.currency ?? null,
    cardHint,
    kind,
    parserConfidence: confidence,
    fingerprint: fingerprint(amount?.amountMinor ?? null, amount?.currency ?? null, kind, merchant, cardHint, occurredAtMs),
  };
}
