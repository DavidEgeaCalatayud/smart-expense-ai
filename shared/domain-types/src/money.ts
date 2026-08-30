export type DecimalMoney = string;

export const MONEY_SCALE = 2 as const;
export const MINOR_UNITS_PER_MAJOR = 100 as const;

const DECIMAL_MONEY_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export interface MinorUnitMoney {
  minorUnits: number;
  currency: string;
  scale: typeof MONEY_SCALE;
}

/**
 * Convert an API v2 decimal-string amount to exact two-decimal minor units.
 *
 * This function deliberately avoids parseFloat/Number decimal arithmetic.
 */
export function decimalToMinorUnits(value: DecimalMoney): number {
  if (!DECIMAL_MONEY_PATTERN.test(value)) {
    throw new Error(`Invalid two-decimal money value: ${value}`);
  }

  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const parts = unsigned.split('.');
  const wholePart = parts[0];
  const fractionalPart = parts[1] ?? '';

  // The regular expression above guarantees a non-empty integer component.
  // Keep this invariant explicit so consumers can enable noUncheckedIndexedAccess.
  if (wholePart === undefined) {
    throw new Error(`Invalid two-decimal money value: ${value}`);
  }

  const paddedFraction = fractionalPart.padEnd(MONEY_SCALE, '0');

  const absoluteMinorUnits =
    BigInt(wholePart) * BigInt(MINOR_UNITS_PER_MAJOR) + BigInt(paddedFraction || '0');
  const signedMinorUnits = negative ? -absoluteMinorUnits : absoluteMinorUnits;

  if (
    signedMinorUnits > MAX_SAFE_INTEGER_BIGINT ||
    signedMinorUnits < -MAX_SAFE_INTEGER_BIGINT
  ) {
    throw new Error(`Money value exceeds JavaScript safe-integer range: ${value}`);
  }

  return Number(signedMinorUnits);
}

/** Convert exact minor units back to the API v2 decimal-string representation. */
export function minorUnitsToDecimal(minorUnits: number): DecimalMoney {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new Error(`Minor-unit value must be a safe integer: ${minorUnits}`);
  }

  const negative = minorUnits < 0;
  const absolute = Math.abs(minorUnits);
  const whole = Math.floor(absolute / MINOR_UNITS_PER_MAJOR);
  const fraction = String(absolute % MINOR_UNITS_PER_MAJOR).padStart(MONEY_SCALE, '0');

  return `${negative ? '-' : ''}${whole}.${fraction}`;
}
