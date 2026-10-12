import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/useAuth';
import { changePassword, deleteAccount, fetchPrivacyExport } from '../services/authApi';
import { SecurityPage } from './SecurityPage';

vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../services/authApi', () => ({
  changePassword: vi.fn(),
  deleteAccount: vi.fn(),
  fetchPrivacyExport: vi.fn(),
}));

const clearLocalSession = vi.fn();

const privacyExport = {
  schemaVersion: 'privacy-export-v1' as const,
  exportedAt: '2026-08-25T19:40:00Z',
  account: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'owner@example.com',
    displayName: 'Privacy Owner',
    createdAt: '2026-08-25T19:00:00Z',
  },
  transactions: [],
  intelligenceFindings: [],
  intelligenceScans: [],
  historicalAnalysisSnapshots: [],
};

describe('SecurityPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: privacyExport.account,
      isLoading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      clearLocalSession,
    });
    vi.mocked(changePassword).mockResolvedValue();
    vi.mocked(deleteAccount).mockResolvedValue();
    vi.mocked(fetchPrivacyExport).mockResolvedValue(privacyExport);

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:privacy-export'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('changes the password through the protected account endpoint', async () => {
    render(<SecurityPage />);

    fireEvent.change(screen.getByLabelText('Contraseña actual'), {
      target: { value: 'correct-horse-battery-staple' },
    });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), {
      target: { value: 'new-correct-horse-battery-staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: 'correct-horse-battery-staple',
        newPassword: 'new-correct-horse-battery-staple',
      }),
    );
    expect(await screen.findByText(/sesiones anteriores se han cerrado/)).toBeInTheDocument();
  });

  it('downloads a privacy export returned by the authenticated API', async () => {
    render(<SecurityPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }));

    await waitFor(() => expect(fetchPrivacyExport).toHaveBeenCalledOnce());
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:privacy-export');
  });

  it('requires typed confirmation and a second dialog before deleting the account', async () => {
    render(<SecurityPage />);

    fireEvent.change(screen.getByLabelText('Contraseña para confirmar'), {
      target: { value: 'correct-horse-battery-staple' },
    });
    fireEvent.change(screen.getByLabelText('Escribe DELETE para confirmar'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar eliminación de cuenta' }));

    expect(deleteAccount).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '¿Eliminar la cuenta permanentemente?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta permanentemente' }));

    await waitFor(() =>
      expect(deleteAccount).toHaveBeenCalledWith({
        password: 'correct-horse-battery-staple',
        confirmation: 'DELETE',
      }),
    );
    expect(clearLocalSession).toHaveBeenCalledOnce();
  });
});
