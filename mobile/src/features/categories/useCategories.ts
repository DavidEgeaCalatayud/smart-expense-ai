import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import {
  SqliteCategoryRepository,
  type LocalCategoryWithUsage,
} from '../../repositories/categoryRepository';
import {
  createOfflineCategory,
  type CategoryTransactionType,
  renameOfflineCategory,
  setOfflineCategoryArchived,
} from './offlineCategoryMutations';

export function useCategories() {
  const db = useSQLiteContext();
  const [categories, setCategories] = useState<LocalCategoryWithUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const repository = new SqliteCategoryRepository(db);
    setCategories(await repository.listManaged());
  }, [db]);

  useEffect(() => {
    let active = true;
    const repository = new SqliteCategoryRepository(db);
    void repository
      .listManaged()
      .then((rows) => {
        if (active) {
          setCategories(rows);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Could not load categories');
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
  }, [db]);

  const mutate = useCallback(
    async (operation: () => Promise<void>) => {
      setIsSaving(true);
      setError(null);
      try {
        await operation();
        await reload();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Could not update category');
        throw caught;
      } finally {
        setIsSaving(false);
      }
    },
    [reload],
  );

  const create = useCallback(
    async (name: string, transactionType: CategoryTransactionType) => {
      await mutate(async () => {
        await createOfflineCategory(db, { name, transactionType });
      });
    },
    [db, mutate],
  );

  const rename = useCallback(
    async (categoryId: string, name: string) => {
      await mutate(() => renameOfflineCategory(db, categoryId, name));
    },
    [db, mutate],
  );

  const setArchived = useCallback(
    async (categoryId: string, archived: boolean) => {
      await mutate(() => setOfflineCategoryArchived(db, categoryId, archived));
    },
    [db, mutate],
  );

  return {
    categories,
    isLoading,
    isSaving,
    error,
    reload,
    create,
    rename,
    setArchived,
  };
}
