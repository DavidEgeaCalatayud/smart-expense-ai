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

export interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
}

export interface DeleteAccountValues {
  password: string;
  confirmation: 'DELETE';
}

export interface PrivacyExport {
  schemaVersion: 'privacy-export-v1';
  exportedAt: string;
  account: {
    id: string;
    email: string;
    displayName: string;
    createdAt: string;
  };
  transactions: Array<{
    id: string;
    merchant: string;
    description: string;
    category: string;
    amount: string;
    currency: string;
    date: string;
    type: string;
    paymentMethod: string;
    isRecurring: boolean;
    source: string;
    createdAt: string;
    updatedAt: string;
  }>;
  intelligenceFindings: Array<Record<string, unknown>>;
  intelligenceScans: Array<Record<string, unknown>>;
  historicalAnalysisSnapshots: Array<Record<string, unknown>>;
}