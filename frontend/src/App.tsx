import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AlertsPage } from './pages/AlertsPage';
import { DashboardPage } from './pages/DashboardPage';
import { PredictionsPage } from './pages/PredictionsPage';
import { SecurityPage } from './pages/SecurityPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { ROUTES } from './routes/paths';

function App() {
  return (
    <AppShell>
      <Routes>
        <Route path={ROUTES.dashboard} element={<DashboardPage />} />
        <Route path={ROUTES.transactions} element={<TransactionsPage />} />
        <Route path={ROUTES.predictions} element={<PredictionsPage />} />
        <Route path={ROUTES.alerts} element={<AlertsPage />} />
        <Route path={ROUTES.security} element={<SecurityPage />} />
        <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
      </Routes>
    </AppShell>
  );
}

export default App;
