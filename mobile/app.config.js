module.exports = ({ config }) => {
  const isProduction = process.env.APP_ENV === 'production';

  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: !isProduction,
            enableMinifyInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
          },
        },
      ],
    ],
    extra: {
      ...(config.extra ?? {}),
      appEnvironment: isProduction ? 'production' : 'development',
    },
  };
};
