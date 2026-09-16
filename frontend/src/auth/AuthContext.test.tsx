import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';
import { fetchCurrentUser } from '../services/authApi';
import type { AuthUser } from '../types/auth';
vi.mock('../services/authApi', () => ({ fetchCurrentUser: vi.fn(), login: vi.fn(), logout: vi.fn(), register: vi.fn() }));
function Probe() {
  const auth = useAuth();
  return <><span>{auth.user ? 'signed in' : 'signed out'}</span><button onClick={auth.clearLocalSession}>Reset completed</button></>;
}
describe('Session invalidation', () => {
  it('does not restore an earlier in-flight session after password recovery cleared it', async () => {
    let resolve!: (user: AuthUser) => void;
    vi.mocked(fetchCurrentUser).mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<AuthProvider><Probe /></AuthProvider>);
    fireEvent.click(screen.getByText('Reset completed'));
    await act(async () => { resolve({ id: 'id', email: 'user@example.com', displayName: 'User' }); });
    expect(screen.getByText('signed out')).toBeInTheDocument();
  });
});
