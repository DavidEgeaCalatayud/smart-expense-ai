export function money(value: string): string {
  const parts = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!parts) return `${value} €`;
  const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sample = formatter.formatToParts(1234567890123);
  const chunks = sample.filter((part) => part.type === 'integer').map((part) => part.value.length);
  const lastSize = chunks.at(-1) ?? 3;
  const repeatSize = chunks.at(-2) ?? lastSize;
  const separator = sample.find((part) => part.type === 'group')?.value ?? ',';
  let remaining = parts[2]!.replace(/^0+(?=\d)/, '');
  const groups: string[] = [];
  let size = lastSize;
  while (remaining.length > size) { groups.unshift(remaining.slice(-size)); remaining = remaining.slice(0, -size); size = repeatSize; }
  groups.unshift(remaining);
  // Use safe numeric samples for locale punctuation; retain all original integer and cent digits.
  return formatter.formatToParts(parts[1] ? -0 : 0).map((part) => part.type === 'integer' ? groups.join(separator)
    : part.type === 'fraction' ? (parts[3] ?? '').padEnd(2, '0') : part.value).join('');
}
export function expenseChange(current: string, previous: string): string | null {
  const cents = (value: string) => { const [whole = '0', decimal = ''] = value.split('.'); return BigInt(whole) * 100n + BigInt(decimal.padEnd(2, '0')); };
  const before = cents(previous); if (before <= 0n) return null;
  const delta = cents(current) - before;
  const tenths = (delta * 1000n + (delta < 0 ? -before / 2n : before / 2n)) / before;
  const absolute = tenths < 0 ? -tenths : tenths;
  return `${tenths > 0 ? '+' : tenths < 0 ? '−' : ''}${absolute / 10n}.${absolute % 10n}%`;
}
