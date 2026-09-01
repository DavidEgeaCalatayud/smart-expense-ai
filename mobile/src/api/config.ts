export function normalizeMobileApiBaseUrl(configured: string | undefined, isDevelopment: boolean): string {
  const value = configured?.trim();
  if (!value) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL is required. Use http://10.0.2.2:8000 for an Android emulator.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be an absolute http(s) URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be an absolute http(s) URL');
  }
  if (!isDevelopment && parsed.protocol !== 'https:') {
    throw new Error('Production mobile API traffic requires HTTPS');
  }

  return value.replace(/\/$/, '');
}

export function getMobileApiBaseUrl(): string {
  return normalizeMobileApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__);
}
