import { useState, type FormEvent } from 'react';
import { Cookie, Database, Download, KeyRound, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { MetricCard } from '../components/dashboard/MetricCard';
import { PageHeader } from '../components/layout/PageHeader';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { changePassword, deleteAccount, fetchPrivacyExport } from '../services/authApi';
import { getApiErrorMessage } from '../services/apiClient';

const securityItems = [
  'Tu contraseña se protege y nunca se muestra ni se devuelve desde la aplicación.',
  'La sesión se guarda de forma segura para reducir el riesgo de acceso desde otras páginas o scripts.',
  'Al cambiar tu contraseña, las sesiones anteriores dejan de ser válidas.',
  'Tus movimientos y datos financieros solo están disponibles dentro de tu cuenta.',
  'La aplicación evita revelar información sobre datos que pertenecen a otras cuentas.',
];

export function SecurityPage() {
  const { user, clearLocalSession } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordStatus(null);
    setIsChangingPassword(true);

    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordStatus('Contraseña actualizada. Las sesiones anteriores se han cerrado.');
    } catch (error) {
      setPasswordStatus(getApiErrorMessage(error, 'No se ha podido cambiar la contraseña.'));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handlePrivacyExport = async () => {
    setExportStatus(null);
    setIsExporting(true);

    try {
      const exportData = await fetchPrivacyExport();
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `smart-expense-privacy-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportStatus('La exportación de tus datos está lista.');
    } catch (error) {
      setExportStatus(getApiErrorMessage(error, 'No se han podido exportar los datos de la cuenta.'));
    } finally {
      setIsExporting(false);
    }
  };

  const openDeleteDialog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDeleteError(null);
    if (!deletePassword || deleteConfirmation !== 'DELETE') {
      setDeleteError('Introduce tu contraseña actual y escribe DELETE exactamente para continuar.');
      return;
    }
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteAccount = async () => {
    setDeleteError(null);
    setIsDeleting(true);

    try {
      await deleteAccount({ password: deletePassword, confirmation: 'DELETE' });
      setIsDeleteDialogOpen(false);
      clearLocalSession();
    } catch (error) {
      setDeleteError(getApiErrorMessage(error, 'No se ha podido eliminar la cuenta.'));
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Privacidad y seguridad"
        title="Seguridad"
        description="Gestiona tu contraseña, sesiones, exportación de datos y privacidad desde un único lugar."
      />

      <section className="grid gap-5 md:grid-cols-3">
        <MetricCard
          title="Autenticación"
          value="Activa"
          detail="Acceso protegido a tu cuenta"
          trend="down"
          icon={<KeyRound size={20} />}
        />
        <MetricCard
          title="Privacidad de datos"
          value="Protegida"
          detail="Tus datos financieros permanecen separados"
          trend="down"
          icon={<Database size={20} />}
        />
        <MetricCard
          title="Sesión"
          value="Controlable"
          detail="Puedes cerrar sesiones al cambiar la contraseña"
          trend="down"
          icon={<Cookie size={20} />}
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
              <LockKeyhole size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Protecciones activas</h2>
              <p className="text-sm text-slate-500">Medidas aplicadas a tu cuenta</p>
            </div>
          </div>

          <div className="space-y-4">
            {securityItems.map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 p-4 text-sm leading-6 text-slate-600">
                {item}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Sesión actual</h2>
              <p className="text-sm text-slate-500">Cuenta con sesión iniciada</p>
            </div>
          </div>
          <dl className="space-y-4 text-sm">
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-slate-400">Nombre</dt>
              <dd className="mt-1 font-semibold text-slate-900">{user?.displayName}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-slate-400">Correo electrónico</dt>
              <dd className="mt-1 font-semibold text-slate-900">{user?.email}</dd>
            </div>
          </dl>
          <p className="mt-5 text-xs leading-5 text-slate-400">
            La recuperación de contraseña está disponible por correo. Las opciones adicionales de seguridad se incorporarán cuando estén listas para producción.
          </p>
        </article>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-3">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <h2 className="text-lg font-bold text-slate-950">Cambiar contraseña</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Al cambiar la contraseña se cerrarán las sesiones anteriores y este navegador permanecerá conectado de forma segura.
          </p>
          <form className="mt-5 space-y-4" onSubmit={handlePasswordChange}>
            <label className="block text-sm font-semibold text-slate-700">
              Contraseña actual
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Nueva contraseña
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <button
              type="submit"
              disabled={isChangingPassword}
              className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isChangingPassword ? 'Actualizando…' : 'Actualizar contraseña'}
            </button>
          </form>
          {passwordStatus ? <p className="mt-4 text-sm leading-6 text-slate-600" role="status">{passwordStatus}</p> : null}
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <Download size={20} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-950">Exportar tus datos</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Descarga una copia de los datos asociados a tu cuenta, incluidos movimientos, análisis e historial. Las credenciales y sesiones no se incluyen.
          </p>
          <button
            type="button"
            onClick={() => void handlePrivacyExport()}
            disabled={isExporting}
            className="mt-5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExporting ? 'Preparando exportación…' : 'Descargar mis datos'}
          </button>
          {exportStatus ? <p className="mt-4 text-sm leading-6 text-slate-600" role="status">{exportStatus}</p> : null}
        </article>

        <article className="rounded-3xl border border-red-200 bg-red-50/40 p-6 shadow-soft">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-700">
            <Trash2 size={20} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-950">Eliminar cuenta</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Elimina permanentemente tu cuenta y todos tus datos financieros. Esta acción no se puede deshacer.
          </p>
          <form className="mt-5 space-y-4" onSubmit={openDeleteDialog}>
            <label className="block text-sm font-semibold text-slate-700">
              Contraseña para confirmar
              <input
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                required
                className="mt-2 w-full rounded-2xl border border-red-200 bg-white px-4 py-3 font-normal outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Escribe DELETE para confirmar
              <input
                type="text"
                autoComplete="off"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                required
                className="mt-2 w-full rounded-2xl border border-red-200 bg-white px-4 py-3 font-normal outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              Revisar eliminación de cuenta
            </button>
          </form>
          {deleteError ? <p className="mt-4 text-sm leading-6 text-red-700" role="alert">{deleteError}</p> : null}
        </article>
      </section>

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        title="¿Eliminar la cuenta permanentemente?"
        description="Se eliminarán tu cuenta y todos los datos financieros asociados. Esta acción no se puede deshacer."
        confirmLabel="Eliminar cuenta permanentemente"
        isConfirming={isDeleting}
        onCancel={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => void handleDeleteAccount()}
      />
    </>
  );
}