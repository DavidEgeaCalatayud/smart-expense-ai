import { CheckCircle2, X } from 'lucide-react';

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

export function Toast({ message, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-xl"
    >
      <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />
      <p className="min-w-0 flex-1 text-sm font-medium text-slate-700">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}
