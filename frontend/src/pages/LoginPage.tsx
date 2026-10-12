import { Brain, Eye, EyeOff, LoaderCircle, LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { ApiErrorAlert } from '../components/ui/ApiErrorAlert';
import { ROUTES } from '../routes/paths';
import { getApiErrorPresentation, type ApiErrorPresentation } from '../services/apiClient';

export function LoginPage() {
  const { user, isLoading, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<ApiErrorPresentation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoading && user) return <Navigate to={ROUTES.dashboard} replace />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn({ email, password });
      navigate(ROUTES.dashboard, { replace: true });
    } catch (submitError) {
      setError(getApiErrorPresentation(submitError, 'No se ha podido iniciar sesión.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <Brain size={24} />
          </div>
          <div>
            <p className="font-bold text-slate-950">Smart Expense AI</p>
            <p className="text-sm text-slate-500">Tus finanzas, privadas y organizadas</p>
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Iniciar sesión</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Accede a tus movimientos, presupuestos, patrimonio y análisis.</p>

        {(isSubmitting || isLoading) && (
          <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle size={16} className="animate-spin" /> Conectando de forma segura…
          </p>
        )}
        {error && <ApiErrorAlert error={error} className="mt-5" />}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-slate-700">
            Correo electrónico
            <input
              autoFocus
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
            />
          </label>

          <div>
            <div className="flex items-center justify-between text-sm">
              <label htmlFor="login-password" className="font-semibold text-slate-700">Contraseña</label>
              <Link to={ROUTES.forgotPassword} className="font-medium text-brand-700 hover:underline">¿La has olvidado?</Link>
            </div>
            <div className="relative mt-2">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 py-3 pl-4 pr-12 font-normal outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-50"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-1 top-1 inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isLoading}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <LoaderCircle size={18} className="animate-spin" /> : <LogIn size={18} />}
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿Aún no tienes cuenta?{' '}
          <Link to={ROUTES.register} className="font-semibold text-brand-700 hover:underline">Crear cuenta</Link>
        </p>
      </div>
    </main>
  );
}
