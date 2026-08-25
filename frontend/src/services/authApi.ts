import type {
  AuthResponse,
  AuthUser,
  ChangePasswordValues,
  DeleteAccountValues,
  LoginValues,
  PrivacyExport,
  RegisterValues,
} from '../types/auth';
import { ApiRequestError, apiFetch } from './apiClient';

export function register(values: RegisterValues): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
}

export function login(values: LoginValues): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
}

export function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout', { method: 'POST' });
}

export function changePassword(values: ChangePasswordValues): Promise<void> {
  return apiFetch<void>('/auth/password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
}

export function fetchPrivacyExport(): Promise<PrivacyExport> {
  return apiFetch<PrivacyExport>('/auth/privacy-export');
}

export function deleteAccount(values: DeleteAccountValues): Promise<void> {
  return apiFetch<void>('/auth/account', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    return await apiFetch<AuthUser>('/auth/me');
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      return null;
    }
    throw error;
  }
}