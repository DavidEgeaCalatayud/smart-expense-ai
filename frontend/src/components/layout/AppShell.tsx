import { Brain, Menu, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-600 text-white">
            <Brain size={21} />
          </div>
          <div>
            <p className="text-sm font-bold">Smart Expense AI</p>
            <p className="text-xs text-slate-500">Tus finanzas</p>
          </div>
        </div>
        <button
          type="button"
          aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700"
        >
          {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            type="button"
            aria-label="Cerrar menú"
            className="absolute inset-0 h-full w-full bg-slate-950/40 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <Sidebar
            className="relative z-10 h-full w-[min(88vw,320px)] overflow-y-auto border-r shadow-2xl"
            onNavigate={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
        <Sidebar className="hidden lg:block" />
        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-10 lg:py-6">{children}</section>
      </div>
    </main>
  );
}
