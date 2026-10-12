export function canonicalMoneyInput(value: string): string {
  let input = value.trim().replace(/\s/g, '').replace(/€/g, '');
  if (!input) return '';

  const negative = input.startsWith('-');
  if (negative) input = input.slice(1);
  if (!input) return '';

  const commaCount = (input.match(/,/g) ?? []).length;
  const dotCount = (input.match(/\./g) ?? []).length;
  const comma = input.lastIndexOf(',');
  const dot = input.lastIndexOf('.');
  let decimalIndex = -1;

  if (comma >= 0 && dot >= 0) {
    decimalIndex = Math.max(comma, dot);
  } else if (comma >= 0) {
    const grouped = /^\d{1,3}(,\d{3})+$/.test(input);
    if (!grouped) {
      if (commaCount > 1) throw new Error('Formato monetario ambiguo.');
      decimalIndex = comma;
    }
  } else if (dot >= 0) {
    const grouped = /^\d{1,3}(\.\d{3})+$/.test(input);
    if (!grouped) {
      if (dotCount > 1) throw new Error('Formato monetario ambiguo.');
      decimalIndex = dot;
    }
  }

  let wholeRaw = decimalIndex >= 0 ? input.slice(0, decimalIndex) : input;
  const fractionRaw = decimalIndex >= 0 ? input.slice(decimalIndex + 1) : '';
  if (fractionRaw.length > 2 || !/^\d*$/.test(fractionRaw)) {
    throw new Error('El importe solo puede tener dos decimales.');
  }
  wholeRaw = wholeRaw.replace(/[.,]/g, '');
  if (!/^\d+$/.test(wholeRaw)) throw new Error('Importe no válido.');

  const whole = wholeRaw.replace(/^0+(?=\d)/, '') || '0';
  return `${negative ? '-' : ''}${whole}${decimalIndex >= 0 ? `.${fractionRaw}` : ''}`;
}

export function formatMoneyInput(value: string): string {
  const canonical = canonicalMoneyInput(value);
  if (!canonical || canonical === '-') return value;
  const negative = canonical.startsWith('-');
  const unsigned = negative ? canonical.slice(1) : canonical;
  const [whole, fraction = ''] = unsigned.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped},${fraction.padEnd(2, '0')} €`;
}
