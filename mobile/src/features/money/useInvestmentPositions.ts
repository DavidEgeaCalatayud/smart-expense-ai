import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import type { LocalFinancialAccountPositionRow, LocalFinancialAccountRow } from '../../database/types';
import {
  archiveInvestmentPosition,
  ensureInvestmentComposition,
  listInvestmentPositions,
  saveInvestmentPosition,
  type InvestmentPositionInput,
} from './investmentPositions';

export function useInvestmentPositions(
  account: LocalFinancialAccountRow,
  onParentChanged: () => Promise<void>,
) {
  const db = useSQLiteContext();
  const [positions, setPositions] = useState<LocalFinancialAccountPositionRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    await ensureInvestmentComposition(db, account);
    setPositions(await listInvestmentPositions(db, account.id));
  }, [account, db]);

  useEffect(() => {
    let active = true;
    void ensureInvestmentComposition(db, account)
      .then(() => listInvestmentPositions(db, account.id))
      .then((nextPositions) => {
        if (active) setPositions(nextPositions);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'No se pudo cargar la composición.');
        }
      });
    return () => { active = false; };
  }, [account, db]);

  const mutate = useCallback(async (operation: () => Promise<void>) => {
    setIsSaving(true);
    setError(null);
    try {
      await operation();
      await reload();
      await onParentChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo actualizar la composición.');
      throw caught;
    } finally {
      setIsSaving(false);
    }
  }, [onParentChanged, reload]);

  const save = useCallback(async (input: InvestmentPositionInput) => {
    await mutate(async () => { await saveInvestmentPosition(db, account.id, input); });
  }, [account.id, db, mutate]);

  const archive = useCallback(async (positionId: string) => {
    await mutate(async () => { await archiveInvestmentPosition(db, account.id, positionId); });
  }, [account.id, db, mutate]);

  const cash = positions.find((position) => position.instrument_type === 'cash') ?? null;
  const funds = positions.filter((position) => position.instrument_type === 'fund');
  const totalMinor = useMemo(
    () => positions.reduce((sum, position) => sum + position.current_value_minor, 0),
    [positions],
  );

  return { cash, funds, totalMinor, isSaving, error, save, archive, reload };
}
