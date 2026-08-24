import { createContext } from 'react';
import type { AuthUser, LoginValues, RegisterValues } from '../types/auth';

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signIn: (values: LoginValues) => Promise<void>;
  signUp: (values: RegisterValues) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
