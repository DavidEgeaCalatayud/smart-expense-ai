import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import { AppShell } from './components/layout/AppShell';
import { AlertsPage } from './pages/AlertsPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { PredictionsPage } from './pages/PredictionsPage';
import { RegisterPage } from './pages/RegisterPage';
import { SecurityPage } from './pages/SecurityPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { ROUTES } from './routes/paths';

function ProtectedWorkspace() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-500">
        Restoring secure session...
      </main>
    );
  }

  if (!user) {
    return <Navigate to={ROUTES.login} replace />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function App() {
  return (
    <Routes>
      <Route path={ROUTES.login} element={<LoginPage />} />
      <Route path={ROUTES.register} element={<RegisterPage />} />

      <Route element={<ProtectedWorkspace />}>
        <Route path={ROUTES.dashboard} element={<DashboardPage />} />
        <Route path={ROUTES.transactions} element={<TransactionsPage />} />
        <Route path={ROUTES.predictions} element={<PredictionsPage />} />
        <Route path={ROUTES.alerts} element={<AlertsPage />} />
        <Route path={ROUTES.security} element={<SecurityPage />} />
      </Route>

      <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
    </Routes>
  );
}

export default App;
