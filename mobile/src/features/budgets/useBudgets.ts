import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import type { LocalCategoryRow } from '../../database/types';
import {
  SqliteBudgetRepository,
  type LocalBudgetWithCategory,
} from '../../repositories/budgetRepository';
import { SqliteCategoryRepository } from '../../repositories/categoryRepository';
import {
  createOfflineBudget,
  deleteOfflineBudget,
  updateOfflineBudget,
} from './offlineBudgetMutations';

export function useBudgets(month: string) {
  const db = useSQLiteContext();
  const [budgets, setBudgets] = useState<LocalBudgetWithCategory[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<LocalCategoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    const budgetRepository = new SqliteBudgetRepository(db);
    const categoryRepository = new SqliteCategoryRepository(db);
    const [nextBudgets, nextCategories] = await Promise.all([
      budgetRepository.listMonth(month),
      categoryRepository.listActiveExpense(),
    ]);
    setBudgets(nextBudgets);
    setExpenseCategories(nextCategories);
  }, [db, month]);

  useEffect(() => {
    let active = true;
    const budgetRepository = new SqliteBudgetRepository(db);
    const categoryRepository = new SqliteCategoryRepository(db);
    void Promise.all([
      budgetRepository.listMonth(month),
      categoryRepository.listActiveExpense(),
    ])
      .then(([nextBudgets, nextCategories]) => {
        if (active) {
          setBudgets(nextBudgets);
          setExpenseCategories(nextCategories);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Could not load budgets');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [db, month]);

  const mutate = useCallback(
    async (operation: () => Promise<void>) => {
      setIsSaving(true);
      setError(null);
      try {
        await operation();
        await loadRows();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not update budget');
        throw caught;
      } finally {
        setIsSaving(false);
      }
    },
    [loadRows],
  );

  const create = useCallback(
    async (categoryId: string | null, limitAmount: string) => {
      await mutate(async () => {
        await createOfflineBudget(db, { month, categoryId, limitAmount });
      });
    },
    [db, month, mutate],
  );

  const update = useCallback(
    async (budgetId: string, limitAmount: string) => {
      await mutate(() => updateOfflineBudget(db, budgetId, limitAmount));
    },
    [db, mutate],
  );

  const remove = useCallback(
    async (budgetId: string) => {
      await mutate(() => deleteOfflineBudget(db, budgetId));
    },
    [db, mutate],
  );

  return {
    budgets,
    expenseCategories,
    isLoading,
    isSaving,
    error,
    reload: loadRows,
    create,
    update,
    remove,
  };
}
