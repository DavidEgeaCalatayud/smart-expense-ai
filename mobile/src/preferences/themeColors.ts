export type ThemeColorRole = 'foreground' | 'background' | 'border';

const DARK_BACKGROUND_COLORS: Record<string, string> = {
  '#ffffff': '#16231d',
  '#fff': '#16231d',
  '#f6f7f9': '#0d1713',
  '#f6f8f7': '#0d1713',
  '#f7faf8': '#15231d',
  '#f8faf9': '#15231d',
  '#f1f4f2': '#26312c',
  '#f2f4f7': '#26312c',
  '#f2f6f4': '#26312c',
  '#eef2f0': '#26312c',
  '#f3f5f4': '#26312c',
  '#e8ebef': '#243a31',
  '#e7ece9': '#294136',
  '#e6f4ee': '#1b3a2e',
  '#eaf6f1': '#1b3a2e',
  '#dff3e9': '#1b3a2e',
  '#e8f4ee': '#1b3a2e',
  '#e1f4e9': '#1b3a2e',
  '#ecfdf3': '#1b3a2e',
  '#fff0ee': '#3a2020',
  '#fff0f0': '#3a2020',
  '#fff7ed': '#3b2a20',
};

const DARK_FOREGROUND_COLORS: Record<string, string> = {
  '#000': '#f4f7f5',
  '#000000': '#f4f7f5',
  '#111827': '#f4f7f5',
  '#0f172a': '#f4f7f5',
  '#344054': '#dce5e0',
  '#374151': '#dce5e0',
  '#475467': '#bac6c0',
  '#47564f': '#b7c5be',
  '#527064': '#b7c5be',
  '#596575': '#b7c5be',
  '#65716b': '#b7c5be',
  '#667085': '#b3c1ba',
  '#667467': '#b3c1ba',
  '#68756f': '#b7c5be',
  '#6b7280': '#b3c1ba',
  '#66708599': '#96a29c',
  '#125c47': '#82d9b4',
  '#167654': '#82d9b4',
  '#17765a': '#82d9b4',
  '#2c8b6d': '#82d9b4',
  '#b42318': '#ff9b94',
  '#a23939': '#ff9b94',
  '#b54708': '#f5b97d',
  '#8b6a24': '#e8c878',
  '#c9ced6': '#9fb1a8',
  '#d9dde3': '#9fb1a8',
  '#e7ece9': '#dce5e0',
};

const DARK_BORDER_COLORS: Record<string, string> = {
  '#c9ced6': '#496555',
  '#d9dde3': '#496555',
  '#d1d5db': '#31483d',
  '#d8e1dc': '#31483d',
  '#dce5e0': '#31483d',
  '#e0e7e3': '#31483d',
  '#e3eae6': '#31483d',
  '#e5e7eb': '#31483d',
  '#e5e9e7': '#31483d',
  '#e7ece9': '#31483d',
  '#edf0ee': '#31483d',
  '#65a58f': '#4f8f78',
  '#9ecbb9': '#4f8f78',
};

function normalizeRole(role: ThemeColorRole | boolean): ThemeColorRole {
  if (role === true) return 'background';
  if (role === false) return 'foreground';
  return role;
}

function hexLuminance(value: string): number | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  const raw = match[1]!;
  const expanded = raw.length === 3
    ? raw.split('').map((part) => `${part}${part}`).join('')
    : raw;
  const red = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const green = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(expanded.slice(4, 6), 16) / 255;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

/**
 * Maps the light application palette to a dark-mode equivalent while keeping
 * semantic accent colours intact. Boolean roles are accepted for compatibility
 * with the previous `background` argument.
 */
export function themedColor(
  value: unknown,
  dark: boolean,
  role: ThemeColorRole | boolean = 'foreground',
): unknown {
  if (!dark || typeof value !== 'string') return value;

  const normalized = value.toLowerCase();
  const resolvedRole = normalizeRole(role);
  const palette = resolvedRole === 'background'
    ? DARK_BACKGROUND_COLORS
    : resolvedRole === 'border'
      ? DARK_BORDER_COLORS
      : DARK_FOREGROUND_COLORS;
  const mapped = palette[normalized];
  if (mapped) return mapped;

  // Protect new, near-white surfaces/borders and very dark text even before
  // they are explicitly added to the palette. This is deliberately conservative
  // so saturated semantic colours are not flattened into neutrals.
  const luminance = hexLuminance(normalized);
  if (luminance === null) return value;
  if (resolvedRole === 'background' && luminance >= 0.88) return '#16231d';
  if (resolvedRole === 'border' && luminance >= 0.72) return '#31483d';
  if (resolvedRole === 'foreground' && luminance <= 0.18) return '#f4f7f5';
  return value;
}
