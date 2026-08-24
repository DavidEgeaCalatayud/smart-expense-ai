import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchCurrentUser, login, logout, register } from '../services/authApi';
import type { AuthUser } from '../types/auth';
import { AuthContext, type AuthContextValue } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void fetchCurrentUser()
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      signIn: async (values) => {
        const result = await login(values);
        setUser(result.user);
      },
      signUp: async (values) => {
        const result = await register(values);
        setUser(result.user);
      },
      signOut: async () => {
        await logout();
        setUser(null);
      },
    }),
    [isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
