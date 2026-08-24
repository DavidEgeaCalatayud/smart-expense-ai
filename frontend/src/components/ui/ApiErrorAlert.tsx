import type { ApiErrorPresentation } from '../../services/apiClient';

interface ApiErrorAlertProps {
  error: ApiErrorPresentation;
  className?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ApiErrorAlert({
  error,
  className = '',
  onRetry,
  retryLabel = 'Retry',
}: ApiErrorAlertProps) {
  return (
    <div
      role="alert"
      data-error-kind={error.kind}
      className={`rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 ${className}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold">{error.title}</p>
          <p className="mt-1 leading-5">{error.message}</p>
          {error.requestId && (
            <p className="mt-2 text-xs text-rose-500">Request ID: {error.requestId}</p>
          )}
        </div>
        {onRetry && error.retryable && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold transition hover:bg-rose-100"
          >
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
