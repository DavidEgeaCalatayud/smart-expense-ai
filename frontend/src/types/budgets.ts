import type { MoneyAmount } from './transactions';

export interface BudgetDefinition {
  id: string;
  month: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryArchived: boolean;
  limitAmount: MoneyAmount;
}

export interface BudgetProgress extends BudgetDefinition {
  spentAmount: MoneyAmount;
  remainingAmount: MoneyAmount;
  percentUsed: string;
  daysRemaining: number;
  overBudget: boolean;
}

export interface BudgetMonth {
  month: string;
  totalBudget: BudgetProgress | null;
  categoryBudgets: BudgetProgress[];
}
