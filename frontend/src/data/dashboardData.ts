import type { Alert, MonthlyExpense, Transaction } from '../types/dashboard';

export const monthlyExpenses: MonthlyExpense[] = [
  { month: 'Jan', amount: 980 },
  { month: 'Feb', amount: 1130 },
  { month: 'Mar', amount: 1040 },
  { month: 'Apr', amount: 1210 },
  { month: 'May', amount: 1375 },
  { month: 'Jun', amount: 1290 },
];

export const recentTransactions: Transaction[] = [
  {
    id: 'trx_001',
    merchant: 'Mercadona',
    category: 'Food',
    amount: 64.35,
    date: '2026-05-30',
    status: 'normal',
  },
  {
    id: 'trx_002',
    merchant: 'Netflix',
    category: 'Subscriptions',
    amount: 15.99,
    date: '2026-05-29',
    status: 'review',
  },
  {
    id: 'trx_003',
    merchant: 'Spotify',
    category: 'Subscriptions',
    amount: 10.99,
    date: '2026-05-28',
    status: 'normal',
  },
  {
    id: 'trx_004',
    merchant: 'Amazon',
    category: 'Shopping',
    amount: 129.99,
    date: '2026-05-27',
    status: 'anomaly',
  },
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
