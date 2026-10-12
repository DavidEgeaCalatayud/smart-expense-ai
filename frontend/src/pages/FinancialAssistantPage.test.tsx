import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryFinancialAssistant } from '../services/financialAssistantApi';
import { FinancialAssistantPage } from './FinancialAssistantPage';

vi.mock('../services/financialAssistantApi', () => ({
  queryFinancialAssistant: vi.fn(),
}));

describe('FinancialAssistantPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits one stateless question and renders canonical evidence and limitations', async () => {
    vi.mocked(queryFinancialAssistant).mockResolvedValue({
      answer: 'You spent €273.35 more than last month, driven mainly by Restaurants and Transport.',
      evidence: [
        {
          source: 'period_comparison',
          reference: '2026-07_vs_2026-08',
          label: '2026-07 vs 2026-08 expense comparison',
        },
        {
          source: 'budget',
          reference: '2026-08',
          label: '2026-08 budget progress',
        },
      ],
      limitations: ['The latest historical snapshot has not been generated yet.'],
      requestId: 'req-assistant-1',
    });

    render(<FinancialAssistantPage />);
    fireEvent.change(screen.getByLabelText('Pregunta sobre tus finanzas'), {
      target: { value: 'Why did I spend more this month?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preguntar al asistente' }));

    expect(queryFinancialAssistant).toHaveBeenCalledWith('Why did I spend more this month?');
    const answer = await screen.findByRole('region', { name: 'Financial Assistant answer' });
    expect(within(answer).getByText(/€273.35 more/)).toBeInTheDocument();
    expect(within(answer).getByText('Comparación de periodos')).toBeInTheDocument();
    expect(within(answer).getByText('Presupuestos')).toBeInTheDocument();
    expect(within(answer).getByText('The latest historical snapshot has not been generated yet.')).toBeInTheDocument();
    expect(within(answer).getByText('Consulta req-assistant-1')).toBeInTheDocument();
  });

  it('uses an example as the next stateless question without auto-submitting it', () => {
    render(<FinancialAssistantPage />);
    fireEvent.click(screen.getByRole('button', { name: '¿Qué presupuestos necesitan mi atención?' }));
    expect(screen.getByLabelText('Pregunta sobre tus finanzas')).toHaveValue('¿Qué presupuestos necesitan mi atención?');
    expect(queryFinancialAssistant).not.toHaveBeenCalled();
  });
});
