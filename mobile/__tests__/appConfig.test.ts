import configure from '../app.config';
import app from '../app.json';

describe('Android distribution configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Expo's Babel transform can inline `delete process.env.EXPO_PUBLIC_*`.
    // Replace the test environment explicitly, including under the E2E runner.
    process.env = { ...originalEnv, EXPO_PUBLIC_E2E_MODE: '', ANDROID_STANDALONE_PREVIEW: '' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each(['preview', 'production'])('hardens %s builds and preserves EAS project linking', (environment) => {
    process.env.APP_ENV = environment;
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    const config = configure({ config: { ...app.expo, extra: { eas: { projectId: 'existing-project' } } } });
    expect(config.extra).toEqual({ appEnvironment: environment, eas: { projectId: 'existing-project' } });
    expect(config.android.allowBackup).toBe(false);
    expect(config.plugins).toContainEqual(['expo-build-properties', {
      android: {
        usesCleartextTraffic: false,
        enableMinifyInReleaseBuilds: true,
        enableShrinkResourcesInReleaseBuilds: true,
      },
    }]);
  });

  it.each(['', 'http://10.0.2.2:8000', 'invalid', 'https://user:password@example.test',
    'https://api.example.test?token=secret', 'https://api.example.test#fragment'])('rejects unusable distribution URL %s before compilation', (url) => {
    for (const environment of ['preview', 'production']) {
      process.env.APP_ENV = environment;
      process.env.EXPO_PUBLIC_API_BASE_URL = url;
      expect(() => configure({ config: app.expo })).toThrow('Android distribution requires');
    }
  });

  it('rejects distribution with E2E diagnostic mode', () => {
    process.env.APP_ENV = 'production';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test';
    process.env.EXPO_PUBLIC_E2E_MODE = '1';
    expect(() => configure({ config: app.expo })).toThrow('must not enable E2E diagnostics');
  });

  it('isolates the temporary preview signing identity from the future Play application', () => {
    process.env.APP_ENV = 'preview';
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://smart-expense-free.onrender.com';
    process.env.ANDROID_STANDALONE_PREVIEW = '1';
    const preview = configure({ config: app.expo });
    expect(preview.android.package).toBe('com.davidegea.smartexpenseai.preview');
    expect(preview.android.allowBackup).toBe(false);
    expect(preview.name).toBe('Smart Expense AI Preview');
    expect(preview.scheme).toBe('smartexpenseai-preview');

    process.env.ANDROID_STANDALONE_PREVIEW = '';
    process.env.APP_ENV = 'production';
    const production = configure({ config: app.expo });
    expect(production.android.package).toBe(app.expo.android.package);
    expect(production.scheme).toBe(app.expo.scheme);
    expect(production.name).toBe(app.expo.name);
  });

  it.each(['development', 'test', 'ci', 'production'])('rejects temporary preview signing identity in %s', (environment) => {
    process.env.APP_ENV = environment;
    process.env.ANDROID_STANDALONE_PREVIEW = '1';
    expect(() => configure({ config: app.expo })).toThrow('requires APP_ENV=preview');
  });

  it.each(['development', 'test', 'ci'])('preserves emulator HTTP for %s', (environment) => {
    process.env.APP_ENV = environment;
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://10.0.2.2:8000';
    const config = configure({ config: app.expo });
    expect(config.plugins).toContainEqual(['expo-build-properties', {
      android: {
        usesCleartextTraffic: true,
        enableMinifyInReleaseBuilds: true,
        enableShrinkResourcesInReleaseBuilds: true,
      },
    }]);
  });
});
