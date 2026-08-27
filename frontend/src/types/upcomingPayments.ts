export type UpcomingPaymentStatus = 'expected' | 'likely' | 'price_changed' | 'overdue';

export interface UpcomingPaymentItem {
  streamKey: string;
  merchant: string;
  canonicalMerchant: string;
  expectedDate: string;
  expectedAmount: string;
  status: UpcomingPaymentStatus;
  cadence: string;
  patternScore: string;
  amountStability: string;
  historyDepth: string;
  occurrenceCount: number;
  missedExpectedOccurrences: number;
  streamBasis: string;
  priceRegimeCount: number;
  lifecycleReactivated: boolean;
  explanation: string;
}

export interface UpcomingPaymentsResponse {
  projectionVersion: string;
  analysisVersion: string;
  asOf: string;
  windowStart: string;
  windowEnd: string;
  days: number;
  expectedTotal: string;
  upcomingCount: number;
  overdueCount: number;
  upcomingPayments: UpcomingPaymentItem[];
  overduePayments: UpcomingPaymentItem[];
}
