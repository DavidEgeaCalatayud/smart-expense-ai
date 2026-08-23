import type { Alert, MonthlyExpense } from '../types/dashboard';

export const monthlyExpenses: MonthlyExpense[] = [
  { month: 'Jan', amount: 980 },
  { month: 'Feb', amount: 1130 },
  { month: 'Mar', amount: 1040 },
  { month: 'Apr', amount: 1210 },
  { month: 'May', amount: 1375 },
  { month: 'Jun', amount: 1290 },
];

export const alerts: Alert[] = [
  {
    id: 'alert_001',
    title: 'Possible duplicated subscription',
    message: 'Two similar streaming payments were detected this month.',
    severity: 'medium',
  },
  {
    id: 'alert_002',
    title: 'Unusual shopping charge',
    message: 'Amazon spending is 42% higher than your monthly average.',
    severity: 'high',
  },
  {
    id: 'alert_003',
    title: 'Forecast warning',
    message: 'At this pace, your monthly spending may exceed the average by 180 EUR.',
    severity: 'low',
  },
];
