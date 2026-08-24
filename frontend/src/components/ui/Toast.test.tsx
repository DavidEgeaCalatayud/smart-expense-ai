import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';


describe('Toast', () => {
  it('announces a success message and can be dismissed', () => {
    const onDismiss = vi.fn();

    render(<Toast message="Transaction saved." onDismiss={onDismiss} />);

    expect(screen.getByRole('status')).toHaveTextContent('Transaction saved.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
