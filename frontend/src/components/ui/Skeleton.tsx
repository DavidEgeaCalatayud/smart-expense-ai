export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-slate-200/80 ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div aria-label="Cargando contenido" role="status" className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-3xl border border-slate-200 bg-white p-5">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="mt-4 h-8 w-3/5" />
            <Skeleton className="mt-3 h-3 w-1/2" />
          </div>
        ))}
      </div>
      <div className="rounded-3xl bg-slate-950 p-7">
        <Skeleton className="h-4 w-32 bg-slate-700/80" />
        <Skeleton className="mt-5 h-12 w-56 bg-slate-700/80" />
        <Skeleton className="mt-6 h-24 w-full bg-slate-800/80" />
      </div>
    </div>
  );
}
