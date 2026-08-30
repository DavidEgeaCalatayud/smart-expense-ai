import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthProvider, useAuth } from '../src/auth/AuthProvider';
import { DATABASE_NAME } from '../src/database/constants';
import { initializeDatabase } from '../src/database/initializeDatabase';

function AppFallback() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" />
    </View>
  );
}

function AuthenticatedStack() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <AppFallback />;
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={user !== null}>
          <Stack.Screen name="index" />
        </Stack.Protected>
        <Stack.Protected guard={user === null}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="register" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <Suspense fallback={<AppFallback />}>
      <SQLiteProvider
        databaseName={DATABASE_NAME}
        onInit={initializeDatabase}
        useSuspense
      >
        <AuthProvider>
          <AuthenticatedStack />
        </AuthProvider>
      </SQLiteProvider>
    </Suspense>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: '#f6f7f9',
    flex: 1,
    justifyContent: 'center',
  },
});
