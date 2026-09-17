import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../auth/useAuth';
import { confirmPasswordReset, requestPasswordReset } from '../services/authApi';
import { PasswordRecoveryPage } from './PasswordRecoveryPage';

vi.mock('../auth/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../services/authApi', () => ({ confirmPasswordReset: vi.fn(), requestPasswordReset: vi.fn() }));
const clearLocalSession = vi.fn();
const token = 'a'.repeat(43);
function Location() { return <span data-testid="location">{useLocation().search}</span>; }
function page(mode: 'request' | 'reset', url = `/reset-password?token=${token}`) {
  render(<MemoryRouter initialEntries={[url]}><PasswordRecoveryPage mode={mode} /><Location /></MemoryRouter>);
}
function enterPasswords(password = 'replacement-password-123', confirmation = password) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirmation } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false, signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), clearLocalSession });
});
describe('Password recovery', () => {
  it('shows the neutral response after requesting recovery', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue({ message: 'If an account exists for that email, you will receive instructions to reset your password.' });
    page('request', '/forgot-password');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send recovery email' }));
    expect(await screen.findByRole('status')).toHaveTextContent('If an account exists');
    expect(requestPasswordReset).toHaveBeenCalledWith('user@example.com');
  });
  it('removes the token from the URL and does not consume it on opening', async () => {
    page('reset');
    await waitFor(() => expect(screen.getByTestId('location')).toBeEmptyDOMElement());
    expect(confirmPasswordReset).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
  it('requires matching passwords then signs out locally after reset', async () => {
    vi.mocked(confirmPasswordReset).mockResolvedValue();
    page('reset');
    enterPasswords('replacement-password-123', 'different-password-123');
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(confirmPasswordReset).not.toHaveBeenCalled();
    enterPasswords();
    expect(await screen.findByRole('status')).toHaveTextContent('signed out on all devices');
    expect(confirmPasswordReset).toHaveBeenCalledWith(token, 'replacement-password-123');
    expect(clearLocalSession).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });
  it('handles missing and expired links with a recovery route', async () => {
    page('reset', '/reset-password');
    expect(screen.getByRole('alert')).toHaveTextContent('missing or invalid');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new recovery link' })).toHaveAttribute('href', '/forgot-password');
  });
  it('shows backend errors without automatically resubmitting a one-use token', async () => {
    vi.mocked(confirmPasswordReset).mockRejectedValue(new Error('This reset link is invalid or expired. Request a new one.'));
    page('reset'); enterPasswords();
    expect(await screen.findByText(/This reset link is invalid or expired/)).toBeInTheDocument();
    expect(confirmPasswordReset).toHaveBeenCalledOnce();
    expect(clearLocalSession).not.toHaveBeenCalled();
  });
});
