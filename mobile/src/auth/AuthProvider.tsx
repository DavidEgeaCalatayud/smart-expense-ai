import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { getMobileApiBaseUrl } from '../api/config';
import { bindLocalAccount } from '../database/accountBoundary';
import { clearLocalAccountDataSafely } from '../database/privacyWipe';
import {
  ensureBackgroundSyncRegistered,
  unregisterBackgroundSync,
} from '../sync/backgroundSync';
import { MobileAuthClient } from './mobileAuthClient';
import {
  loginMobileSession,
  logoutMobileSession,
  registerMobileSession,
  restoreMobileSession,
} from './sessionManager';
import type { MobileAuthUser } from './secureCredentials';

interface AuthContextValue {
  user: MobileAuthUser | null;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, displayName: string): Promise<void>;
  logout(): Promise<void>;
  clearError(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Unable to complete authentication.';
}

async function reconcileBackgroundSyncRegistration(authenticated: boolean): Promise<void> {
  try {
    if (authenticated) {
      await ensureBackgroundSyncRegistered();
    } else {
      await unregisterBackgroundSync();
    }
  } catch {
    // Background scheduling is opportunistic and must never block authentication.
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const client = useMemo(() => new MobileAuthClient(getMobileApiBaseUrl()), []);
  const [user, setUser] = useState<MobileAuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const restored = await restoreMobileSession(client);
        if (restored.shouldClearLocalData) {
          await clearLocalAccountDataSafely(db);
        }
        if (restored.user) {
          await bindLocalAccount(db, restored.user.id);
        }
        await reconcileBackgroundSyncRegistration(restored.user !== null);
        if (!cancelled) {
          setUser(restored.user);
        }
      } catch (restoreError) {
        if (!cancelled) {
          setError(errorMessage(restoreError));
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, db]);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const authenticated = await loginMobileSession(client, email.trim(), password);
        await bindLocalAccount(db, authenticated.id);
        await reconcileBackgroundSyncRegistration(true);
        setUser(authenticated);
      } catch (loginError) {
        setError(errorMessage(loginError));
        throw loginError;
      } finally {
        setIsSubmitting(false);
      }
    },
    [client, db],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const authenticated = await registerMobileSession(
          client,
          email.trim(),
          password,
          displayName.trim(),
        );
        await bindLocalAccount(db, authenticated.id);
        await reconcileBackgroundSyncRegistration(true);
        setUser(authenticated);
      } catch (registerError) {
        setError(errorMessage(registerError));
        throw registerError;
      } finally {
        setIsSubmitting(false);
      }
    },
    [client, db],
  );

  const logout = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await logoutMobileSession(client);
      await clearLocalAccountDataSafely(db);
    } finally {
      await reconcileBackgroundSyncRegistration(false);
      setUser(null);
      setIsSubmitting(false);
    }
  }, [client, db]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isSubmitting,
      error,
      login,
      register,
      logout,
      clearError,
    }),
    [user, isLoading, isSubmitting, error, login, register, logout, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
