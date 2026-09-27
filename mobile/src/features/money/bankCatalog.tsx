import { useMemo, useState } from 'react';
import { Image } from 'react-native';

import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from '../../ui/primitives';
import {
  filterMobileBankInstitutions,
  findMobileBankInstitution,
  type MobileBankInstitution,
} from './bankCatalogData';

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
  const bank = findMobileBankInstitution(fallbackName) ?? findMobileBankInstitution(institution);
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
        onError={() => setFailedDomain(bank.domain)}
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
  const filtered = useMemo(() => filterMobileBankInstitutions(query), [query]);

  return (
    <View style={styles.picker}>
      <Text style={styles.pickerTitle}>Banco o plataforma</Text>
      <Text style={styles.pickerHint}>Puedes añadir tantas cuentas como necesites. Los brokers se clasifican automáticamente como inversión y suman en Invertido.</Text>
      <TextInput
        testID="bank-institution-search"
        accessibilityLabel="Buscar banco"
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar Bankinter, eToro, Trading 212..."
        style={styles.searchInput}
      />
      <Text style={styles.scrollHint}>Desliza para ver todas las entidades disponibles</Text>
      <ScrollView
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        style={styles.bankScroll}
        contentContainerStyle={styles.bankGrid}
      >
        {filtered.map((bank) => {
          const active = selected?.id === bank.id;
          return (
            <Pressable
              key={bank.id}
              testID={`bank-institution-${bank.id}`}
              accessibilityLabel={`Seleccionar ${bank.name}`}
              onPress={() => onSelect(bank)}
              style={[styles.bankCard, active && styles.bankCardActive]}
            >
              <MobileBankLogo institution={bank.name} fallbackName={bank.name} size={38} />
              <Text style={styles.bankName} numberOfLines={1}>{bank.name}</Text>
            </Pressable>
          );
        })}
        {filtered.length === 0 ? <Text style={styles.noResults}>No aparece en el catálogo. Escríbelo manualmente.</Text> : null}
      </ScrollView>
      <Text style={styles.manualLabel}>Otro banco / entidad</Text>
      <TextInput
        testID="bank-institution-manual"
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
  scrollHint: { color: '#65716b', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  bankScroll: { maxHeight: 300 },
  bankGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  bankCard: { width: '48%', minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e7e3', borderRadius: 15, padding: 9 },
  bankCardActive: { borderColor: '#65a58f', backgroundColor: '#eaf6f1' },
  bankName: { flex: 1, fontSize: 12, fontWeight: '800' },
  logoShell: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e9e7', overflow: 'hidden' },
  logoFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#e6f4ee' },
  logoFallbackText: { color: '#125c47', fontSize: 11, fontWeight: '900' },
  noResults: { width: '100%', color: '#65716b', fontSize: 11, textAlign: 'center', paddingVertical: 12 },
  manualLabel: { color: '#47564f', fontSize: 11, fontWeight: '700', marginTop: 2 },
});
