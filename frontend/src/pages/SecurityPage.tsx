import { useState, type FormEvent } from 'react';
import { Cookie, Database, Download, KeyRound, LockKeyhole, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { MetricCard } from '../components/dashboard/MetricCard';
import { PageHeader } from '../components/layout/PageHeader';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { changePassword, deleteAccount, fetchPrivacyExport } from '../services/authApi';
import { getApiErrorMessage } from '../services/apiClient';

const securityItems = [
  'Passwords are hashed with Argon2 before persistence and are never returned by the API.',
  'The signed session token is stored in an HttpOnly, SameSite=Lax cookie instead of browser storage.',
  'Password changes rotate the current session and revoke previously issued session versions server-side.',
  'Transaction list, update and delete queries are scoped by the authenticated user ID.',
  'Cross-account transaction IDs return 404 so ownership information is not disclosed.',
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
      setPasswordStatus('Password updated. Previously issued sessions have been revoked.');
    } catch (error) {
      setPasswordStatus(getApiErrorMessage(error, 'Unable to change password.'));
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
      setExportStatus('Privacy export created from your authenticated account data.');
    } catch (error) {
      setExportStatus(getApiErrorMessage(error, 'Unable to export account data.'));
    } finally {
      setIsExporting(false);
    }
  };

  const openDeleteDialog = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDeleteError(null);
    if (!deletePassword || deleteConfirmation !== 'DELETE') {
      setDeleteError('Enter your current password and type DELETE exactly to continue.');
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
      setDeleteError(getApiErrorMessage(error, 'Unable to delete account.'));
      setIsDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Privacy and security"
        title="Security"
        description="Authentication, session revocation, per-user financial data isolation and account privacy controls are active."
      />

      <section className="grid gap-5 md:grid-cols-3">
        <MetricCard
          title="Authentication"
          value="Active"
          detail="FastAPI session authentication"
          trend="down"
          icon={<KeyRound size={20} />}
        />
        <MetricCard
          title="Data isolation"
          value="Enforced"
          detail="Financial data scoped by user ID"
          trend="down"
          icon={<Database size={20} />}
        />
        <MetricCard
          title="Session"
          value="Revocable"
          detail="HttpOnly JWT + server-side version"
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
              <h2 className="text-lg font-bold">Implemented controls</h2>
              <p className="text-sm text-slate-500">Current account and API guarantees</p>
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
              <h2 className="text-lg font-bold">Current session</h2>
              <p className="text-sm text-slate-500">Authenticated account</p>
            </div>
          </div>
          <dl className="space-y-4 text-sm">
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-slate-400">Display name</dt>
              <dd className="mt-1 font-semibold text-slate-900">{user?.displayName}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-slate-400">Email</dt>
              <dd className="mt-1 font-semibold text-slate-900">{user?.email}</dd>
            </div>
          </dl>
          <p className="mt-5 text-xs leading-5 text-slate-400">
            Password reset by email and MFA remain deployment-readiness work because they require verified recovery and second-factor delivery channels.
          </p>
        </article>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-3">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <h2 className="text-lg font-bold text-slate-950">Change password</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Changing your password revokes previously issued sessions and keeps this browser signed in with a newly versioned session.
          </p>
          <form className="mt-5 space-y-4" onSubmit={handlePasswordChange}>
            <label className="block text-sm font-semibold text-slate-700">
              Current password
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
              New password
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
              {isChangingPassword ? 'Updating...' : 'Update password'}
            </button>
          </form>
          {passwordStatus ? <p className="mt-4 text-sm leading-6 text-slate-600" role="status">{passwordStatus}</p> : null}
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <Download size={20} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-950">Export your data</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Download a JSON export of your account, transactions, intelligence findings, scans and historical snapshots. Password hashes and session tokens are never included.
          </p>
          <button
            type="button"
            onClick={() => void handlePrivacyExport()}
            disabled={isExporting}
            className="mt-5 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExporting ? 'Preparing export...' : 'Download privacy export'}
          </button>
          {exportStatus ? <p className="mt-4 text-sm leading-6 text-slate-600" role="status">{exportStatus}</p> : null}
        </article>

        <article className="rounded-3xl border border-red-200 bg-red-50/40 p-6 shadow-soft">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-700">
            <Trash2 size={20} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-950">Delete account</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Permanently delete your account and all user-owned financial, intelligence and historical-analysis data. This cannot be undone.
          </p>
          <form className="mt-5 space-y-4" onSubmit={openDeleteDialog}>
            <label className="block text-sm font-semibold text-slate-700">
              Password to confirm deletion
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
              Type DELETE to confirm
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
              Review account deletion
            </button>
          </form>
          {deleteError ? <p className="mt-4 text-sm leading-6 text-red-700" role="alert">{deleteError}</p> : null}
        </article>
      </section>

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        title="Permanently delete account?"
        description="Your account and all user-owned transactions, findings, scans and historical-analysis snapshots will be deleted. There is no undo."
        confirmLabel="Delete account permanently"
        isConfirming={isDeleting}
        onCancel={() => setIsDeleteDialogOpen(false)}
        onConfirm={() => void handleDeleteAccount()}
      />
    </>
  );
}