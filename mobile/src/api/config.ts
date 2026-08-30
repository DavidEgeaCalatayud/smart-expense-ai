export function getMobileApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!configured) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL is required. Use http://10.0.2.2:8000 for an Android emulator.',
    );
  }
  if (!/^https?:\/\//.test(configured)) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be an absolute http(s) URL');
  }
  return configured.replace(/\/$/, '');
}
