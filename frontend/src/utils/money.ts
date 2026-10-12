import type { MoneyAmount } from '../types/transactions';

const MONEY_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;

export function normalizeMoneyAmount(value: string): MoneyAmount {
  let input = value.trim().replace(/\s/g, '').replace(/€/g, '');
  const negativeInput = input.startsWith('-');
  if (negativeInput) input = input.slice(1);

  const comma = input.lastIndexOf(',');
  const dot = input.lastIndexOf('.');
  let decimalIndex = -1;
  if (comma >= 0 && dot >= 0) {
    decimalIndex = Math.max(comma, dot);
  } else if (comma >= 0) {
    decimalIndex = input.length - comma - 1 <= 2 ? comma : -1;
  } else if (dot >= 0) {
    decimalIndex = input.length - dot - 1 <= 2 ? dot : -1;
  }

  const whole = (decimalIndex >= 0 ? input.slice(0, decimalIndex) : input).replace(/[.,]/g, '');
  const fraction = decimalIndex >= 0 ? input.slice(decimalIndex + 1) : '';
  const trimmed = `${negativeInput ? '-' : ''}${whole}${decimalIndex >= 0 ? `.${fraction}` : ''}`;
  if (!MONEY_PATTERN.test(trimmed)) {
    throw new Error('Money values must use at most two decimal places.');
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ''] = unsigned.split('.');
  return `${negative ? '-' : ''}${whole}.${fraction.padEnd(2, '0')}`;
}

export function moneyToCents(value: MoneyAmount): number {
  const normalized = normalizeMoneyAmount(value);
  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction] = unsigned.split('.');
  const cents = Number.parseInt(whole, 10) * 100 + Number.parseInt(fraction, 10);
  return negative ? -cents : cents;
}

export function isNegativeMoney(value: MoneyAmount): boolean {
  return moneyToCents(value) < 0;
}

export function moneyToChartNumber(value: MoneyAmount): number {
  // Recharts requires a JS number. Domain arithmetic stays in integer cents;
  // conversion happens only at this visualization boundary.
  return moneyToCents(value) / 100;
}

function groupedInteger(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatMoneyWithDecimals(value: MoneyAmount): string {
  const cents = moneyToCents(value);
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return `${negative ? '-' : ''}€${groupedInteger(whole)}.${String(fraction).padStart(2, '0')}`;
}

export function formatMoneyRounded(value: MoneyAmount): string {
  const cents = moneyToCents(value);
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const roundedWhole = Math.floor((absolute + 50) / 100);
  return `${negative ? '-' : ''}€${groupedInteger(roundedWhole)}`;
}


export function formatMoneyInput(value: string): string {
  const normalized = normalizeMoneyAmount(value);
  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction] = unsigned.split('.');
  return `${negative ? '-' : ''}${Number.parseInt(whole, 10).toLocaleString('es-ES')},${fraction} €`;
}
