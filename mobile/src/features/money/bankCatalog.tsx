import type { FinancialAccountType } from '@smart-expense-ai/api-contracts';
import { useMemo, useState } from 'react';
import { Image } from 'react-native';

import { Pressable, StyleSheet, Text, TextInput, View } from '../../ui/primitives';

export interface MobileBankInstitution {
  id: string;
  name: string;
  domain: string;
  aliases: string[];
  suggestedType: FinancialAccountType;
}

export const MOBILE_BANK_INSTITUTIONS: MobileBankInstitution[] = [
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

export function findMobileBankInstitution(value: string | null | undefined): MobileBankInstitution | null {
  if (!value) return null;
  const normalized = normalize(value);
  return MOBILE_BANK_INSTITUTIONS.find((bank) => (
    normalize(bank.name) === normalized
    || bank.aliases.some((alias) => normalize(alias) === normalized)
  )) ?? null;
}

function logoUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

export function MobileBankLogo({
  institution,
  fallbackName,
  size = 42,
}: {
  institution?: string | null;
  fallbackName: string;
  size?: number;
}) {
  const bank = findMobileBankInstitution(institution) ?? findMobileBankInstitution(fallbackName);
  const [failed, setFailed] = useState(false);
  const initials = (bank?.name ?? fallbackName)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '€';

  if (!bank || failed) {
    return (
      <View style={[styles.logoFallback, { width: size, height: size, borderRadius: Math.round(size / 3) }]}>
        <Text style={styles.logoFallbackText}>{initials}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.logoShell, { width: size, height: size, borderRadius: Math.round(size / 3) }]}>
      <Image
        source={{ uri: logoUrl(bank.domain) }}
        accessibilityLabel={`Logo de ${bank.name}`}
        resizeMode="contain"
        style={{ width: size - 10, height: size - 10 }}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

export function MobileBankPicker({
  value,
  onSelect,
  onManualChange,
}: {
  value: string;
  onSelect: (bank: MobileBankInstitution) => void;
  onManualChange: (institution: string) => void;
}) {
  const [query, setQuery] = useState('');
  const selected = findMobileBankInstitution(value);
  const filtered = useMemo(() => {
    const normalizedQuery = normalize(query);
    const matches = normalizedQuery
      ? MOBILE_BANK_INSTITUTIONS.filter((bank) => (
          [bank.name, bank.domain, ...bank.aliases].map(normalize).join(' ').includes(normalizedQuery)
        ))
      : MOBILE_BANK_INSTITUTIONS;
    return matches.slice(0, normalizedQuery ? 12 : 10);
  }, [query]);

  return (
    <View style={styles.picker}>
      <Text style={styles.pickerTitle}>Banco o plataforma</Text>
      <Text style={styles.pickerHint}>Busca la entidad y la guardaremos para mostrar su logo en Mi dinero.</Text>
      <TextInput
        accessibilityLabel="Buscar banco"
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar Bankinter, imagin, Trade Republic..."
        style={styles.searchInput}
      />
      <View style={styles.bankGrid}>
        {filtered.map((bank) => {
          const active = selected?.id === bank.id;
          return (
            <Pressable
              key={bank.id}
              onPress={() => onSelect(bank)}
              style={[styles.bankCard, active && styles.bankCardActive]}
            >
              <MobileBankLogo institution={bank.name} fallbackName={bank.name} size={38} />
              <Text style={styles.bankName} numberOfLines={1}>{bank.name}</Text>
            </Pressable>
          );
        })}
      </View>
      {filtered.length === 0 ? <Text style={styles.noResults}>No aparece en el catálogo. Escríbelo manualmente.</Text> : null}
      <Text style={styles.manualLabel}>Otro banco / entidad</Text>
      <TextInput
        value={selected ? '' : value}
        onChangeText={onManualChange}
        placeholder="Escribe el nombre si no aparece arriba"
        style={styles.searchInput}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { backgroundColor: '#f7faf8', borderRadius: 18, borderWidth: 1, borderColor: '#dce5e0', padding: 13, gap: 9 },
  pickerTitle: { fontSize: 14, fontWeight: '800' },
  pickerHint: { color: '#65716b', fontSize: 11, lineHeight: 16 },
  searchInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce5e0', borderRadius: 14, paddingHorizontal: 12, minHeight: 44, fontSize: 14 },
  bankGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bankCard: { width: '48%', minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e7e3', borderRadius: 15, padding: 9 },
  bankCardActive: { borderColor: '#65a58f', backgroundColor: '#eaf6f1' },
  bankName: { flex: 1, fontSize: 12, fontWeight: '800' },
  logoShell: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e9e7', overflow: 'hidden' },
  logoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#e6f4ee' },
  logoFallbackText: { color: '#125c47', fontSize: 11, fontWeight: '900' },
  noResults: { color: '#65716b', fontSize: 11, textAlign: 'center', paddingVertical: 4 },
  manualLabel: { color: '#47564f', fontSize: 11, fontWeight: '700', marginTop: 2 },
});
