import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBudget, deleteBudget, fetchBudgets, updateBudget } from '../services/budgetsApi';
import { fetchCategories } from '../services/categoriesApi';
import { BudgetsPage } from './BudgetsPage';

vi.mock('../services/budgetsApi', () => ({
  createBudget: vi.fn(),
  deleteBudget: vi.fn(),
  fetchBudgets: vi.fn(),
  updateBudget: vi.fn(),
}));

vi.mock('../services/categoriesApi', () => ({
  fetchCategories: vi.fn(),
}));

const overall = {
  id: 'overall-budget',
  month: '2026-08',
  categoryId: null,
  categoryName: null,
  categoryArchived: false,
  limitAmount: '2000.00',
  spentAmount: '328.00',
  remainingAmount: '1672.00',
  percentUsed: '16.4',
  daysRemaining: 5,
  overBudget: false,
};

const gym = {
  id: 'gym-budget',
  month: '2026-08',
  categoryId: 'gym-category',
  categoryName: 'Gym',
  categoryArchived: false,
  limitAmount: '400.00',
  spentAmount: '328.00',
  remainingAmount: '72.00',
  percentUsed: '82.0',
  daysRemaining: 5,
  overBudget: false,
};

describe('BudgetsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchBudgets).mockResolvedValue({
      month: '2026-08',
      totalBudget: overall,
      categoryBudgets: [gym],
    });
    vi.mocked(fetchCategories).mockResolvedValue([
      {
        id: 'gym-category',
        name: 'Gym',
        transactionType: 'expense',
        scope: 'user',
        archived: false,
        transactionCount: 1,
      },
    ]);
    vi.mocked(createBudget).mockResolvedValue(overall);
    vi.mocked(updateBudget).mockResolvedValue(overall);
    vi.mocked(deleteBudget).mockResolvedValue(undefined);
  });

  it('renders persisted overall and category budget progress', async () => {
    render(<BudgetsPage />);

    const overallEditButton = await screen.findByRole('button', { name: 'Edit overall budget' });
    const overallCard = overallEditButton.closest('article');
    expect(overallCard).not.toBeNull();
    expect(within(overallCard as HTMLElement).getByText('Overall spending')).toBeInTheDocument();

    const gymEditButton = screen.getByRole('button', { name: 'Edit Gym budget' });
    const gymCard = gymEditButton.closest('article');
    expect(gymCard).not.toBeNull();
    expect(within(gymCard as HTMLElement).getByText('Gym')).toBeInTheDocument();
    expect(within(gymCard as HTMLElement).getByText('82.0% used · 5 days left')).toBeInTheDocument();
    expect(within(gymCard as HTMLElement).getByText('€72.00 remaining')).toBeInTheDocument();
  });

  it('normalizes a category budget amount before submitting it', async () => {
    render(<BudgetsPage />);
    await screen.findByRole('option', { name: 'Gym' });

    fireEvent.change(screen.getByLabelText('Budget scope'), { target: { value: 'gym-category' } });
    fireEvent.change(screen.getByLabelText('Budget limit'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create budget' }));

    await waitFor(() => {
      expect(createBudget).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: 'gym-category', limitAmount: '500.00' }),
      );
    });
  });
});
