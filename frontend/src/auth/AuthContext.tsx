import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchCurrentUser, login, logout, register } from '../services/authApi';
import type { AuthUser } from '../types/auth';
import { AuthContext, type AuthContextValue } from './authContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const sessionRevision = useRef(0);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const revision = sessionRevision.current;

    void fetchCurrentUser()
      .then((currentUser) => {
        if (active && revision === sessionRevision.current) setUser(currentUser);
      })
      .catch(() => {
        if (active && revision === sessionRevision.current) setUser(null);
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
        sessionRevision.current += 1;
        const result = await login(values);
        setUser(result.user);
      },
      signUp: async (values) => {
        sessionRevision.current += 1;
        const result = await register(values);
        setUser(result.user);
      },
      signOut: async () => {
        sessionRevision.current += 1;
        await logout();
        setUser(null);
      },
      clearLocalSession: () => {
        sessionRevision.current += 1;
        setIsLoading(false);
        setUser(null);
      },
    }),
    [isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}