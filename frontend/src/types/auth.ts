export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface RegisterValues {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginValues {
  email: string;
  password: string;
}
