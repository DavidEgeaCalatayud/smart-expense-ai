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

import { changePasswordSession } from './changePasswordSession';
import { getMobileApiBaseUrl } from '../api/config';
import { getSharedMobileApiClient } from '../api/client';
import { pauseAndDrainSessionWork, resumeSessionWork } from './sessionWork';
import { deleteMobileAccount } from './accountDeletion';
import {
  registerBackgroundSyncAsync,
  unregisterBackgroundSyncAsync,
} from '../background/backgroundSync';
import { bindLocalAccount } from '../database/accountBoundary';
import { clearLocalAccountData } from '../database/clearAccountData';
import { MobileAuthClient } from './mobileAuthClient';
import {
  loginMobileSession,
  logoutMobileSession,
  registerMobileSession,
  restoreLocalMobileSession,
  validateRestoredMobileSession,
} from './sessionManager';
import {
  acknowledgeLocalWipeRequirement,
  invalidateMobileSessionAndRequireLocalWipe,
  subscribeMobileSessionInvalidation,
  type MobileAuthUser,
} from './secureCredentials';

interface AuthContextValue {
  user: MobileAuthUser | null;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, displayName: string): Promise<void>;
  logout(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  deleteAccount(password: string, confirmation: string): Promise<void>;
  clearError(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Unable to complete authentication.';
}

export function AuthProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const client = useMemo(() => new MobileAuthClient(getMobileApiBaseUrl()), []);
  const api = useMemo(() => getSharedMobileApiClient(), []);
  const [user, setUser] = useState<MobileAuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearRejectedSession = useCallback(async () => {
    await pauseAndDrainSessionWork();
    await clearLocalAccountData(db);
    await acknowledgeLocalWipeRequirement();
    setUser(null);
  }, [db]);

  useEffect(() => subscribeMobileSessionInvalidation(() => clearRejectedSession()), [clearRejectedSession]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // Security boundary first: restoreLocalMobileSession checks the durable wipe marker before
        // trusting any cached credentials. A complete local session does not wait for Render.
        const restored = await restoreLocalMobileSession();
        if (restored.shouldClearLocalData) {
          // A headless revocation/partial-session marker is acknowledged only after the SQLite wipe
          // succeeds. If the process dies during the wipe, the next startup retries it.
          await clearLocalAccountData(db);
          await acknowledgeLocalWipeRequirement();
        }

        if (!restored.user || !restored.snapshot) {
          if (!cancelled) setUser(null);
          return;
        }

        // Bind the account-local replica before any network call so Mi dinero can render from
        // SQLite immediately when the device is offline or Render is waking from sleep.
        await bindLocalAccount(db, restored.user.id);
        resumeSessionWork();
        if (!cancelled) {
          setUser(restored.user);
          setIsLoading(false);
        }

        // Revalidate in the background. Network/time-out/5xx failures intentionally preserve the
        // offline session. Only an access-token 401 followed by a refresh-token 401 invalidates it.
        void validateRestoredMobileSession(client, restored.snapshot)
          .then(async (validation) => {
            if (cancelled || validation.status === 'offline' || validation.status === 'superseded') {
              return;
            }
            if (validation.status === 'invalid') {
              if (!cancelled) await clearRejectedSession();
              return;
            }

            // /auth/me is authoritative for profile fields. If the server identity differs from
            // the cached identity, bindLocalAccount performs the account-boundary wipe before the
            // new user can become visible.
            if (validation.user.id !== restored.user.id) {
              await pauseAndDrainSessionWork();
              await bindLocalAccount(db, validation.user.id);
              resumeSessionWork();
            }
            if (!cancelled) setUser(validation.user);
          })
          .catch(() => {
            // Unexpected validation failures are non-destructive. Foreground sync/reconnect will
            // retry; only confirmed 401 + rejected refresh is allowed to destroy an offline session.
          });
      } catch (restoreError) {
        if (!cancelled) {
          setError(errorMessage(restoreError));
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          // For authenticated local sessions this was already cleared before remote validation.
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearRejectedSession, client, db]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    if (user) {
      void registerBackgroundSyncAsync().catch(() => {
        // Background execution is best-effort; foreground sync remains the correctness path.
      });
    } else {
      void unregisterBackgroundSyncAsync().catch(() => {
        // A restricted/unavailable scheduler must never block authentication flows.
      });
    }
  }, [isLoading, user]);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        const authenticated = await loginMobileSession(client, email.trim(), password);
        await bindLocalAccount(db, authenticated.id);
        resumeSessionWork();
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
        resumeSessionWork();
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
      await pauseAndDrainSessionWork();
      // logoutMobileSession persists the wipe requirement before credentials are discarded.
      await logoutMobileSession(client);
      await clearLocalAccountData(db);
      await acknowledgeLocalWipeRequirement();
      setUser(null);
    } finally {
      setIsSubmitting(false);
    }
  }, [client, db]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!user) throw new Error('Sign in before changing your password.');
    setIsSubmitting(true);
    setError(null);
    try { await changePasswordSession(db, api, client, user, currentPassword, newPassword, setUser); }
    finally { setIsSubmitting(false); }
  }, [api, client, db, user]);

  const clearError = useCallback(() => setError(null), []);

  const deleteAccount = useCallback(async (password: string, confirmation: string) => {
    setIsSubmitting(true);
    setError(null);
    let deleted = false;
    try {
      await pauseAndDrainSessionWork();
      await deleteMobileAccount(api, password, confirmation, async () => {
        deleted = true;
        // The server already revoked every session. Persist the wipe marker immediately,
        // without another network request between server deletion and device cleanup.
        await invalidateMobileSessionAndRequireLocalWipe();
        await clearLocalAccountData(db);
        await acknowledgeLocalWipeRequirement();
        setUser(null);
      });
    } finally {
      if (!deleted) resumeSessionWork();
      setIsSubmitting(false);
    }
  }, [api, db]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isSubmitting,
      error,
      login,
      register,
      logout,
      deleteAccount,
      changePassword,
      clearError,
    }),
    [user, isLoading, isSubmitting, error, login, register, logout, deleteAccount, changePassword, clearError],
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
