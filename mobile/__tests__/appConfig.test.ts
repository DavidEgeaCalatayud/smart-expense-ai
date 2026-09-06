import configure from '../app.config';
import app from '../app.json';

describe('Android distribution configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_E2E_MODE;
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
