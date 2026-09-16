import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { ApiErrorAlert } from '../components/ui/ApiErrorAlert';
import { ROUTES } from '../routes/paths';
import { confirmPasswordReset, requestPasswordReset } from '../services/authApi';
import { getApiErrorPresentation, type ApiErrorPresentation } from '../services/apiClient';

const fieldClass = 'mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal focus:border-brand-400';

export function PasswordRecoveryPage({ mode }: { mode: 'request' | 'reset' }) {
  const { clearLocalSession } = useAuth();
  const [params, setParams] = useSearchParams();
  // Keep the bearer secret only in this component's memory, never persistent storage.
  const [token] = useState(() => params.get('token') ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<ApiErrorPresentation | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const reset = mode === 'reset';
  const validToken = /^[A-Za-z0-9_-]{43}$/.test(token);

  useEffect(() => {
    if (params.has('token')) setParams({}, { replace: true });
  }, [params, setParams]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    if (reset && password !== confirmation) {
      setError(getApiErrorPresentation(new Error('Passwords do not match.'), 'Check your password'));
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      if (reset) {
        await confirmPasswordReset(token, password);
        clearLocalSession();
        setPassword('');
        setConfirmation('');
        setMessage('Password changed. You have been signed out on all devices. Sign in with your new password.');
      } else {
        const result = await requestPasswordReset(email);
        setMessage(result.message);
      }
    } catch (caught) {
      setError(getApiErrorPresentation(caught, 'Unable to complete password recovery.'));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
    <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
      <p className="mb-6 font-bold text-brand-700">Smart Expense AI</p>
      <h1 className="text-2xl font-bold text-slate-950">{reset ? 'Reset password' : 'Forgot password'}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{reset
        ? 'Choose a password with 12–128 characters. This will sign you out on all devices.'
        : "We'll send you a secure link to choose a new password. Check your spam folder too."}</p>
      {message ? <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{message}</p>
        : reset && !validToken ? <p role="alert" className="mt-6 text-sm text-red-700">This reset link is missing or invalid. Request a new one.</p>
        : <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-5">
          {reset ? <>
            <label className="block text-sm font-semibold">New password<input className={fieldClass} type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <label className="block text-sm font-semibold">Confirm new password<input className={fieldClass} type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>
          </> : <label className="block text-sm font-semibold">Email<input className={fieldClass} type="email" autoComplete="email" maxLength={320} required value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
          <button disabled={pending} type="submit" className="w-full rounded-2xl bg-brand-600 px-5 py-3 font-semibold text-white disabled:opacity-60">{pending ? 'Please wait…' : reset ? 'Save new password' : 'Send recovery email'}</button>
        </form>}
      {error && <ApiErrorAlert className="mt-5" error={error} />}
      {reset && !message && <Link className="mt-5 block text-sm font-semibold text-brand-700" to={ROUTES.forgotPassword}>Request a new recovery link</Link>}
      <Link className="mt-6 block text-sm font-semibold text-brand-700" to={ROUTES.login}>Back to sign in</Link>
    </section>
  </main>;
}
