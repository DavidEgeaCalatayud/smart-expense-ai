import { minorUnitsToDecimal } from '@smart-expense-ai/domain-types';
import { useMemo, useState } from 'react';

import type { LocalFinancialAccountPositionRow, LocalFinancialAccountRow } from '../../database/types';
import { Pressable, StyleSheet, Text, TextInput, View } from '../../ui/primitives';
import { searchMyInvestorFunds, type MyInvestorFundCatalogItem } from './myInvestorFundCatalog';
import { useInvestmentPositions } from './useInvestmentPositions';

function euro(minor: number): string {
  const negative = minor < 0;
  const absolute = Math.abs(minor);
  return `${negative ? '-' : ''}${Math.floor(absolute / 100).toLocaleString('es-ES')},${String(absolute % 100).padStart(2, '0')} €`;
}

interface Props {
  account: LocalFinancialAccountRow;
  onParentChanged: () => Promise<void>;
}

export function MyInvestorComposition({ account, onParentChanged }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showFundForm, setShowFundForm] = useState(false);
  const [showCashForm, setShowCashForm] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedFund, setSelectedFund] = useState<MyInvestorFundCatalogItem | null>(null);
  const [fundName, setFundName] = useState('');
  const [fundIsin, setFundIsin] = useState('');
  const [invested, setInvested] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [units, setUnits] = useState('');
  const [averagePrice, setAveragePrice] = useState('');
  const [editingId, setEditingId] = useState<string | undefined>();
  const [cashValue, setCashValue] = useState('');
  const { cash, funds, totalMinor, isSaving, error, save, archive } = useInvestmentPositions(account, onParentChanged);

  const matches = useMemo(() => searchMyInvestorFunds(query).slice(0, 6), [query]);

  const resetFundForm = () => {
    setShowFundForm(false);
    setSelectedFund(null);
    setQuery('');
    setFundName('');
    setFundIsin('');
    setInvested('');
    setCurrentValue('');
    setUnits('');
    setAveragePrice('');
    setEditingId(undefined);
  };

  const chooseFund = (fund: MyInvestorFundCatalogItem) => {
    setSelectedFund(fund);
    setFundName(fund.name);
    setFundIsin(fund.isin);
    setQuery(fund.name);
  };

  const editFund = (fund: LocalFinancialAccountPositionRow) => {
    setEditingId(fund.id);
    setFundName(fund.name);
    setFundIsin(fund.isin ?? '');
    setQuery(fund.name);
    setInvested(minorUnitsToDecimal(fund.invested_minor));
    setCurrentValue(minorUnitsToDecimal(fund.current_value_minor));
    setUnits(fund.units ?? '');
    setAveragePrice(fund.average_price_minor === null ? '' : minorUnitsToDecimal(fund.average_price_minor));
    setShowFundForm(true);
  };

  return (
    <View style={styles.wrapper}>
      <Pressable
        testID="myinvestor-composition-toggle"
        onPress={() => setExpanded((value) => !value)}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>{expanded ? 'Ocultar composición' : 'Ver composición MyInvestor'}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.panel}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>Efectivo disponible</Text>
              <Text style={styles.amount}>{euro(cash?.current_value_minor ?? 0)}</Text>
            </View>
            <Pressable
              testID="myinvestor-edit-cash"
              style={styles.smallButton}
              onPress={() => {
                setCashValue(minorUnitsToDecimal(cash?.current_value_minor ?? 0));
                setShowCashForm((value) => !value);
              }}
            >
              <Text style={styles.smallButtonText}>Actualizar</Text>
            </Pressable>
          </View>

          {showCashForm ? (
            <View style={styles.form}>
              <TextInput
                accessibilityLabel="Efectivo MyInvestor"
                value={cashValue}
                onChangeText={setCashValue}
                keyboardType="decimal-pad"
                placeholder="350,00"
                style={styles.input}
              />
              <Pressable
                disabled={isSaving}
                testID="myinvestor-save-cash"
                style={styles.primary}
                onPress={() => void save({
                  instrumentType: 'cash',
                  name: 'Efectivo disponible',
                  invested: cashValue,
                  currentValue: cashValue,
                }).then(() => setShowCashForm(false)).catch(() => undefined)}
              >
                <Text style={styles.primaryText}>Guardar efectivo</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.heading}>Fondos de inversión</Text>
              <Text style={styles.muted}>{funds.length} posiciones</Text>
            </View>
            <Pressable
              testID="myinvestor-add-fund"
              style={styles.primary}
              onPress={() => { resetFundForm(); setShowFundForm(true); }}
            >
              <Text style={styles.primaryText}>Añadir fondo</Text>
            </Pressable>
          </View>

          {funds.map((fund) => (
            <View key={fund.id} style={styles.fundCard}>
              <Text style={styles.fundName}>{fund.name}</Text>
              {fund.isin ? <Text style={styles.muted}>ISIN {fund.isin}</Text> : null}
              <View style={styles.metrics}>
                <Text style={styles.metric}>Invertido: {euro(fund.invested_minor)}</Text>
                <Text style={styles.metric}>Valor actual: {euro(fund.current_value_minor)}</Text>
                {fund.units ? <Text style={styles.metric}>Participaciones: {fund.units}</Text> : null}
                {fund.average_price_minor !== null ? <Text style={styles.metric}>Precio medio: {euro(fund.average_price_minor)}</Text> : null}
              </View>
              <View style={styles.actions}>
                <Pressable style={styles.smallButton} onPress={() => editFund(fund)}>
                  <Text style={styles.smallButtonText}>Editar</Text>
                </Pressable>
                <Pressable style={styles.archiveButton} onPress={() => void archive(fund.id).catch(() => undefined)}>
                  <Text style={styles.archiveText}>Eliminar posición</Text>
                </Pressable>
              </View>
            </View>
          ))}

          {showFundForm ? (
            <View style={styles.form}>
              <Text style={styles.heading}>{editingId ? 'Editar fondo' : 'Añadir fondo'}</Text>
              <TextInput
                accessibilityLabel="Buscar fondo por nombre o ISIN"
                value={query}
                onChangeText={(value) => {
                  setQuery(value);
                  if (selectedFund && value !== selectedFund.name) setSelectedFund(null);
                }}
                placeholder="Nombre o ISIN"
                style={styles.input}
              />
              {!editingId && query.trim() ? (
                <View style={styles.results}>
                  {matches.map((fund) => (
                    <Pressable key={fund.isin} style={styles.result} onPress={() => chooseFund(fund)}>
                      <Text style={styles.resultName}>{fund.name}</Text>
                      <Text style={styles.muted}>{fund.isin} · {fund.manager}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <TextInput accessibilityLabel="Nombre del fondo" value={fundName} onChangeText={setFundName} placeholder="Nombre del fondo" style={styles.input} />
              <TextInput accessibilityLabel="ISIN del fondo" value={fundIsin} onChangeText={setFundIsin} autoCapitalize="characters" placeholder="ISIN (opcional)" style={styles.input} />
              <TextInput accessibilityLabel="Importe invertido" value={invested} onChangeText={setInvested} keyboardType="decimal-pad" placeholder="Importe invertido" style={styles.input} />
              <TextInput accessibilityLabel="Valor actual" value={currentValue} onChangeText={setCurrentValue} keyboardType="decimal-pad" placeholder="Valor actual" style={styles.input} />
              <TextInput accessibilityLabel="Participaciones" value={units} onChangeText={setUnits} keyboardType="decimal-pad" placeholder="Participaciones (opcional)" style={styles.input} />
              <TextInput accessibilityLabel="Precio medio" value={averagePrice} onChangeText={setAveragePrice} keyboardType="decimal-pad" placeholder="Precio medio (opcional)" style={styles.input} />
              <View style={styles.actions}>
                <Pressable
                  disabled={isSaving}
                  testID="myinvestor-save-fund"
                  style={styles.primary}
                  onPress={() => void save({
                    id: editingId,
                    instrumentType: 'fund',
                    name: fundName || selectedFund?.name || query,
                    isin: fundIsin || selectedFund?.isin || null,
                    invested,
                    currentValue,
                    units,
                    averagePrice,
                  }).then(resetFundForm).catch(() => undefined)}
                >
                  <Text style={styles.primaryText}>Guardar fondo</Text>
                </Pressable>
                <Pressable style={styles.smallButton} onPress={resetFundForm}>
                  <Text style={styles.smallButtonText}>Cancelar</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total MyInvestor</Text>
            <Text testID="myinvestor-total" style={styles.totalAmount}>{euro(totalMinor)}</Text>
          </View>
          <Text style={styles.note}>
            El patrimonio suma únicamente este total agregado. Efectivo y fondos son desglose interno y no se contabilizan otra vez.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 10 },
  toggle: { borderWidth: 1, borderColor: '#b8c9c1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  toggleText: { color: '#285d4d', fontWeight: '800' },
  panel: { gap: 14, borderTopWidth: 1, borderTopColor: '#e3ebe7', paddingTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  label: { color: '#526159', fontWeight: '700', fontSize: 12 },
  amount: { color: '#101827', fontWeight: '900', fontSize: 22, marginTop: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  heading: { color: '#172033', fontWeight: '900', fontSize: 15 },
  muted: { color: '#6b776f', fontSize: 12, lineHeight: 17 },
  fundCard: { borderWidth: 1, borderColor: '#dce6e0', borderRadius: 14, padding: 12, gap: 7, backgroundColor: '#fbfdfc' },
  fundName: { color: '#172033', fontWeight: '900', fontSize: 14 },
  metrics: { gap: 3 },
  metric: { color: '#526159', fontSize: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  smallButton: { borderWidth: 1, borderColor: '#b8c9c1', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
  smallButtonText: { color: '#285d4d', fontWeight: '800' },
  primary: { backgroundColor: '#126b52', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 10 },
  primaryText: { color: '#fff', fontWeight: '800' },
  archiveButton: { paddingHorizontal: 8, paddingVertical: 8 },
  archiveText: { color: '#ad3535', fontWeight: '800' },
  form: { gap: 9, borderWidth: 1, borderColor: '#dce6e0', borderRadius: 14, padding: 12 },
  input: { borderWidth: 1, borderColor: '#d4dfda', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', color: '#13201b' },
  results: { gap: 6 },
  result: { borderWidth: 1, borderColor: '#e2e9e5', borderRadius: 10, padding: 9, gap: 2 },
  resultName: { color: '#172033', fontWeight: '800', fontSize: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#dce6e0' },
  totalLabel: { color: '#172033', fontWeight: '900' },
  totalAmount: { color: '#0f5f49', fontWeight: '900', fontSize: 20 },
  note: { color: '#6b776f', fontSize: 11, lineHeight: 16 },
  error: { color: '#a32626', fontWeight: '700' },
});
