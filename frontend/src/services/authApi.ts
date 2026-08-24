import type { AuthResponse, AuthUser, LoginValues, RegisterValues } from '../types/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const AUTH_ENDPOINT = `${API_BASE_URL}/api/auth`;

async function parseError(response: Response, fallback: string): Promise<Error> {
  try {
    const body = (await response.json()) as { detail?: string };
    return new Error(body.detail ?? fallback);
  } catch {
    return new Error(fallback);
  }
}

export async function register(values: RegisterValues): Promise<AuthResponse> {
  const response = await fetch(`${AUTH_ENDPOINT}/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });

  if (!response.ok) {
    throw await parseError(response, 'Unable to create account');
  }

  return response.json();
}

export async function login(values: LoginValues): Promise<AuthResponse> {
  const response = await fetch(`${AUTH_ENDPOINT}/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });

  if (!response.ok) {
    throw await parseError(response, 'Unable to sign in');
  }

  return response.json();
}

export async function logout(): Promise<void> {
  const response = await fetch(`${AUTH_ENDPOINT}/logout`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw await parseError(response, 'Unable to sign out');
  }
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch(`${AUTH_ENDPOINT}/me`, {
    credentials: 'include',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw await parseError(response, 'Unable to restore session');
  }

  return response.json();
}
