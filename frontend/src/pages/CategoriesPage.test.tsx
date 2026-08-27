import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  archiveCategory,
  createCategory,
  fetchCategories,
  renameCategory,
  restoreCategory,
} from '../services/categoriesApi';
import { CategoriesPage } from './CategoriesPage';

vi.mock('../services/categoriesApi', () => ({
  archiveCategory: vi.fn(),
  createCategory: vi.fn(),
  fetchCategories: vi.fn(),
  renameCategory: vi.fn(),
  restoreCategory: vi.fn(),
}));

const categories = [
  {
    id: 'system-food',
    name: 'Food',
    transactionType: 'expense' as const,
    scope: 'system' as const,
    archived: false,
    transactionCount: 2,
  },
  {
    id: 'user-gym',
    name: 'Gym',
    transactionType: 'expense' as const,
    scope: 'user' as const,
    archived: false,
    transactionCount: 1,
  },
  {
    id: 'user-old',
    name: 'Old hobby',
    transactionType: 'expense' as const,
    scope: 'user' as const,
    archived: true,
    transactionCount: 0,
  },
];

describe('CategoriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCategories).mockResolvedValue(categories);
    vi.mocked(createCategory).mockResolvedValue({ ...categories[1], id: 'new' });
    vi.mocked(archiveCategory).mockResolvedValue({ ...categories[1], archived: true });
    vi.mocked(renameCategory).mockResolvedValue(categories[1]);
    vi.mocked(restoreCategory).mockResolvedValue({ ...categories[2], archived: false });
  });

  it('creates a user category with an explicit transaction type', async () => {
    render(<CategoriesPage />);
    expect(await screen.findByText('Gym')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Category name'), { target: { value: 'Travel' } });
    fireEvent.change(screen.getByLabelText('Category type'), { target: { value: 'expense' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create category' }));

    await waitFor(() => {
      expect(createCategory).toHaveBeenCalledWith({ name: 'Travel', transactionType: 'expense' });
    });
  });

  it('requires an explicit archive decision and can preserve historical assignments', async () => {
    render(<CategoriesPage />);
    expect(await screen.findByText('Gym')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archive & keep history' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive & keep history' }));

    await waitFor(() => {
      expect(archiveCategory).toHaveBeenCalledWith('user-gym', { mode: 'archive' });
    });
  });
});
