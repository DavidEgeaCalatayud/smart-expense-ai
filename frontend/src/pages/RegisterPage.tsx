import { Brain, Eye, EyeOff, LoaderCircle, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { ApiErrorAlert } from '../components/ui/ApiErrorAlert';
import { ROUTES } from '../routes/paths';
import { getApiErrorPresentation, type ApiErrorPresentation } from '../services/apiClient';

export function RegisterPage() {
  const { user, isLoading, signUp } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<ApiErrorPresentation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordLongEnough = password.length >= 12;

  if (!isLoading && user) return <Navigate to={ROUTES.dashboard} replace />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signUp({ displayName, email, password });
      navigate(ROUTES.dashboard, { replace: true });
    } catch (submitError) {
      setError(getApiErrorPresentation(submitError, 'No se ha podido crear la cuenta.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white"><Brain size={24} /></div>
          <div>
            <p className="font-bold text-slate-950">Smart Expense AI</p>
            <p className="text-sm text-slate-500">Crea tu espacio financiero personal</p>
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Crear cuenta</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Empieza a organizar tus gastos, presupuestos y patrimonio desde un único lugar.</p>
        {error && <ApiErrorAlert error={error} className="mt-5" />}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-slate-700">
            Nombre
            <input autoFocus type="text" required maxLength={120} autoComplete="name" value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-50" />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Correo electrónico
            <input type="email" required autoComplete="email" value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-50" />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Contraseña
            <div className="relative mt-2">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 py-3 pl-4 pr-12 font-normal outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
              />
              <button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-1 top-1 inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <span className={`mt-2 block text-xs font-medium ${passwordLongEnough ? 'text-emerald-700' : 'text-slate-400'}`}>
              {passwordLongEnough ? '✓' : '○'} Mínimo 12 caracteres
            </span>
          </label>

          <button type="submit" disabled={isSubmitting || isLoading || !passwordLongEnough}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
            {isSubmitting ? <LoaderCircle size={18} className="animate-spin" /> : <UserPlus size={18} />}
            {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Ya tienes cuenta?{' '}
          <Link to={ROUTES.login} className="font-semibold text-brand-700 hover:underline">Iniciar sesión</Link>
        </p>
      </div>
    </main>
  );
}
