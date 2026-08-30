import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { DATABASE_NAME } from '../src/database/constants';
import { initializeDatabase } from '../src/database/initializeDatabase';

function DatabaseFallback() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" />
    </View>
  );
}

export default function RootLayout() {
  return (
    <Suspense fallback={<DatabaseFallback />}>
      <SQLiteProvider
        databaseName={DATABASE_NAME}
        onInit={initializeDatabase}
        useSuspense
      >
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
        </Stack>
      </SQLiteProvider>
    </Suspense>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
