module.exports = ({ config }) => {
  // Read the build process environment each time Expo evaluates this config.
  const buildEnvironment = process.env;
  const appEnvironment = buildEnvironment.APP_ENV || 'development';
  const isDistribution = ['preview', 'production'].includes(appEnvironment);
  const standalonePreview = buildEnvironment.ANDROID_STANDALONE_PREVIEW === '1';

  if (standalonePreview && appEnvironment !== 'preview') {
    throw new Error('Standalone Android preview requires APP_ENV=preview');
  }

  // Fail at build configuration time, rather than shipping an app that cannot
  // reach its backend when __DEV__ is false.
  if (isDistribution) {
    let apiUrl;
    try {
      apiUrl = new URL(buildEnvironment.EXPO_PUBLIC_API_BASE_URL || '');
    } catch {
      throw new Error('Android distribution requires an HTTPS EXPO_PUBLIC_API_BASE_URL');
    }
    if (apiUrl.protocol !== 'https:' || apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash) {
      throw new Error('Android distribution requires an HTTPS API URL without credentials, query or fragment');
    }
    if (buildEnvironment.EXPO_PUBLIC_E2E_MODE === '1') {
      throw new Error('Android distribution must not enable E2E diagnostics');
    }
  }

  return {
    ...config,
    ...(standalonePreview ? {
      name: 'Smart Expense AI Preview',
      scheme: 'smartexpenseai-preview',
      android: { ...config.android, package: 'com.davidegea.smartexpenseai.preview' },
    } : {}),
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: !isDistribution,
            enableMinifyInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
          },
        },
      ],
    ],
    extra: {
      ...(config.extra ?? {}),
      appEnvironment,
    },
  };
};
