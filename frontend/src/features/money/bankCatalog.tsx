import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FinancialAccountType } from '../../types/financialAccounts';

export interface BankInstitution {
  id: string;
  name: string;
  domain: string;
  aliases: string[];
  suggestedType: FinancialAccountType;
}

export const BANK_INSTITUTIONS: BankInstitution[] = [
  { id: 'bankinter', name: 'Bankinter', domain: 'bankinter.com', aliases: ['bank inter'], suggestedType: 'checking' },
  { id: 'imagin', name: 'imagin', domain: 'imagin.com', aliases: ['imaginbank', 'imagin bank', 'caixabank'], suggestedType: 'checking' },
  { id: 'caixabank', name: 'CaixaBank', domain: 'caixabank.es', aliases: ['la caixa', 'caixa'], suggestedType: 'checking' },
  { id: 'santander', name: 'Banco Santander', domain: 'bancosantander.es', aliases: ['santander'], suggestedType: 'checking' },
  { id: 'bbva', name: 'BBVA', domain: 'bbva.es', aliases: [], suggestedType: 'checking' },
  { id: 'sabadell', name: 'Banco Sabadell', domain: 'bancsabadell.com', aliases: ['sabadell'], suggestedType: 'checking' },
  { id: 'ing', name: 'ING', domain: 'ing.es', aliases: ['ing direct'], suggestedType: 'checking' },
  { id: 'openbank', name: 'Openbank', domain: 'openbank.es', aliases: ['open bank'], suggestedType: 'checking' },
  { id: 'unicaja', name: 'Unicaja Banco', domain: 'unicajabanco.es', aliases: ['unicaja'], suggestedType: 'checking' },
  { id: 'kutxabank', name: 'Kutxabank', domain: 'kutxabank.es', aliases: [], suggestedType: 'checking' },
  { id: 'abanca', name: 'ABANCA', domain: 'abanca.com', aliases: [], suggestedType: 'checking' },
  { id: 'cajamar', name: 'Cajamar', domain: 'grupocooperativocajamar.es', aliases: ['grupo cajamar'], suggestedType: 'checking' },
  { id: 'ibercaja', name: 'Ibercaja', domain: 'ibercaja.es', aliases: [], suggestedType: 'checking' },
  { id: 'revolut', name: 'Revolut', domain: 'revolut.com', aliases: [], suggestedType: 'wallet' },
  { id: 'n26', name: 'N26', domain: 'n26.com', aliases: [], suggestedType: 'checking' },
  { id: 'trade-republic', name: 'Trade Republic', domain: 'traderepublic.com', aliases: ['trade republic bank'], suggestedType: 'broker' },
  { id: 'myinvestor', name: 'MyInvestor', domain: 'myinvestor.es', aliases: ['my investor'], suggestedType: 'broker' },
  { id: 'wise', name: 'Wise', domain: 'wise.com', aliases: ['transferwise'], suggestedType: 'wallet' },
  { id: 'paypal', name: 'PayPal', domain: 'paypal.com', aliases: [], suggestedType: 'wallet' },
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function findBankInstitution(value: string | null | undefined): BankInstitution | null {
  if (!value) return null;
  const normalized = normalize(value);
  return BANK_INSTITUTIONS.find((bank) => (
    normalize(bank.name) === normalized
    || bank.aliases.some((alias) => normalize(alias) === normalized)
  )) ?? null;
}

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
  const bank = findBankInstitution(institution) ?? findBankInstitution(fallbackName);
  const [failed, setFailed] = useState(false);
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
        onError={() => setFailed(true)}
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
  const filtered = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return BANK_INSTITUTIONS;
    return BANK_INSTITUTIONS.filter((bank) => {
      const haystack = [bank.name, bank.domain, ...bank.aliases].map(normalize).join(' ');
      return haystack.includes(normalizedQuery);
    });
  }, [query]);

  return (
    <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Banco o plataforma</p>
          <p className="mt-1 text-xs text-slate-500">Busca y selecciona la entidad para mostrar su logo en Mi dinero.</p>
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
          placeholder="Buscar Bankinter, imagin, Trade Republic..."
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-normal outline-none focus:border-brand-400"
        />
      </div>

      <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
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
