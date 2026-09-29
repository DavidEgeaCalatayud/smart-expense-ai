import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  filterBankInstitutions,
  findBankInstitution,
  type BankInstitution,
} from './bankCatalogData';

function logoUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

export function BankLogo({
  institution,
  fallbackName,
  className = 'h-11 w-11',
}: {
  institution?: string | null;
  fallbackName: string;
  className?: string;
}) {
  const bank = findBankInstitution(fallbackName) ?? findBankInstitution(institution);
  const [failedDomain, setFailedDomain] = useState<string | null>(null);
  const failed = bank ? failedDomain === bank.domain : false;
  const initials = (bank?.name ?? fallbackName)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '€';

  if (!bank || failed) {
    return (
      <div className={`${className} flex shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-sm font-extrabold text-brand-700`}>
        {initials}
      </div>
    );
  }

  return (
    <div className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-white p-1.5`}>
      <img
        src={logoUrl(bank.domain)}
        alt={`Logo de ${bank.name}`}
        className="h-full w-full object-contain"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedDomain(bank.domain)}
      />
    </div>
  );
}

export function BankInstitutionPicker({
  value,
  onSelect,
  onManualChange,
}: {
  value: string;
  onSelect: (bank: BankInstitution) => void;
  onManualChange: (institution: string) => void;
}) {
  const [query, setQuery] = useState('');
  const selected = findBankInstitution(value);
  const filtered = useMemo(() => filterBankInstitutions(query), [query]);

  return (
    <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Banco o plataforma</p>
          <p className="mt-1 text-xs text-slate-500">Puedes añadir tantas cuentas como necesites. Los brokers se clasifican automáticamente como inversión y suman en Invertido.</p>
        </div>
        {selected && (
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">
            <BankLogo institution={selected.name} fallbackName={selected.name} className="h-7 w-7" />
            {selected.name}
          </div>
        )}
      </div>

      <div className="relative mt-4">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar Bankinter, eToro, Trading 212..."
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-normal outline-none focus:border-brand-400"
        />
      </div>

      <p className="mt-2 text-center text-[11px] font-semibold text-slate-500">Desliza para ver todas las entidades disponibles</p>
      <div className="mt-2 grid max-h-64 gap-2 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((bank) => {
          const active = selected?.id === bank.id;
          return (
            <button
              key={bank.id}
              type="button"
              onClick={() => onSelect(bank)}
              className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${active ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <BankLogo institution={bank.name} fallbackName={bank.name} className="h-10 w-10" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-slate-900">{bank.name}</span>
                <span className="block truncate text-xs text-slate-500">{bank.domain}</span>
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="sm:col-span-2 lg:col-span-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
            No aparece en el catálogo. Puedes escribir la entidad manualmente abajo.
          </p>
        )}
      </div>

      <label className="mt-4 block text-xs font-semibold text-slate-600">
        Otro banco / entidad
        <input
          maxLength={120}
          value={selected ? '' : value}
          onChange={(event) => onManualChange(event.target.value)}
          placeholder="Escribe el nombre si no aparece arriba"
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal"
        />
      </label>
    </div>
  );
}
