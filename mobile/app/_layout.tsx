import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
      <Stack
        screenOptions={{
          headerShown: false,
          // RN 0.86/Fabric has an open Android mounting crash associated with native-stack
          // transitions. This app does not depend on Android route animations, so keep the native
          // stack while disabling only that transition path; iOS retains its platform animation.
          animation: Platform.OS === 'android' ? 'none' : 'default',
        }}
      >
        <Stack.Protected guard={user !== null}>
          <Stack.Screen name="index" />
          <Stack.Screen name="categories" />
          <Stack.Screen name="budgets" />
          <Stack.Screen name="dashboard" />
          <Stack.Screen name="intelligence" />
          <Stack.Screen name="historical" />
          <Stack.Screen name="predictions" />
          <Stack.Screen name="suggestions" />
          <Stack.Screen name="assistant" />
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
    <SafeAreaProvider>
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
    </SafeAreaProvider>
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
