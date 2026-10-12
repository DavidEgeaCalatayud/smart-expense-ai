export function canonicalMoneyInput(value: string): string {
  let input = value.trim().replace(/\s/g, '').replace(/€/g, '');
  if (!input) return '';

  const negative = input.startsWith('-');
  if (negative) input = input.slice(1);

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

  let wholeRaw = decimalIndex >= 0 ? input.slice(0, decimalIndex) : input;
  let fractionRaw = decimalIndex >= 0 ? input.slice(decimalIndex + 1) : '';
  wholeRaw = wholeRaw.replace(/[.,]/g, '').replace(/[^0-9]/g, '');
  fractionRaw = fractionRaw.replace(/[^0-9]/g, '').slice(0, 2);

  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  return `${negative ? '-' : ''}${whole}${decimalIndex >= 0 ? `.${fractionRaw}` : ''}`;
}

export function formatMoneyInput(value: string): string {
  const canonical = canonicalMoneyInput(value);
  if (!canonical || canonical === '-') return value;
  const negative = canonical.startsWith('-');
  const unsigned = negative ? canonical.slice(1) : canonical;
  const [whole, fraction = ''] = unsigned.split('.');
  const grouped = Number.parseInt(whole || '0', 10).toLocaleString('es-ES');
  return `${negative ? '-' : ''}${grouped},${fraction.padEnd(2, '0')} €`;
}
