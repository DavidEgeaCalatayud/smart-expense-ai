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
      setError(getApiErrorPresentation(new Error('Las contraseñas no coinciden.'), 'Revisa la contraseña'));
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
        setMessage('Contraseña actualizada. Se han cerrado las sesiones anteriores. Inicia sesión con tu nueva contraseña.');
      } else {
        await requestPasswordReset(email);
        setMessage('Si existe una cuenta con ese correo, recibirás instrucciones para restablecer la contraseña.');
      }
    } catch (caught) {
      setError(getApiErrorPresentation(caught, 'No se ha podido completar la recuperación de contraseña.'));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
    <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
      <p className="mb-6 font-bold text-brand-700">Smart Expense AI</p>
      <h1 className="text-2xl font-bold text-slate-950">{reset ? 'Restablecer contraseña' : 'Recuperar contraseña'}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{reset
        ? 'Elige una contraseña de entre 12 y 128 caracteres. Al cambiarla se cerrarán las sesiones anteriores.'
        : 'Te enviaremos un enlace seguro para elegir una nueva contraseña. Revisa también la carpeta de spam.'}</p>
      {message ? <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{message}</p>
        : reset && !validToken ? <p role="alert" className="mt-6 text-sm text-red-700">Este enlace de recuperación no es válido o está incompleto. Solicita uno nuevo.</p>
        : <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-5">
          {reset ? <>
            <label className="block text-sm font-semibold">Nueva contraseña<input className={fieldClass} type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <label className="block text-sm font-semibold">Confirmar nueva contraseña<input className={fieldClass} type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>
          </> : <label className="block text-sm font-semibold">Correo electrónico<input className={fieldClass} type="email" autoComplete="email" maxLength={320} required value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
          <button disabled={pending} type="submit" className="w-full rounded-2xl bg-brand-600 px-5 py-3 font-semibold text-white disabled:opacity-60">{pending ? 'Procesando…' : reset ? 'Guardar nueva contraseña' : 'Enviar correo de recuperación'}</button>
        </form>}
      {error && <ApiErrorAlert className="mt-5" error={error} />}
      {reset && !message && <Link className="mt-5 block text-sm font-semibold text-brand-700" to={ROUTES.forgotPassword}>Solicitar un nuevo enlace</Link>}
      <Link className="mt-6 block text-sm font-semibold text-brand-700" to={ROUTES.login}>Volver a iniciar sesión</Link>
    </section>
  </main>;
}
