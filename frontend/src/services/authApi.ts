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
import { authRequest } from './authRequest';

export function register(values: RegisterValues): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
}

export function login(values: LoginValues): Promise<AuthResponse> {
  return authRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  }, true);
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
    return await authRequest<AuthUser>('/auth/me', {}, true);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return authRequest('/auth/password-reset/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim() }),
  });
}

export function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  return authRequest('/auth/password-reset/confirm', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
}
