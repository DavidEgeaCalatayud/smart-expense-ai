export type FinancialAssistantEvidenceSource =
  | 'financial_summary'
  | 'period_comparison'
  | 'budget'
  | 'financial_findings'
  | 'historical_analysis'
  | 'transaction_search';

export interface FinancialAssistantEvidence {
  source: FinancialAssistantEvidenceSource;
  reference: string;
  label: string;
}

export interface FinancialAssistantAnswer {
  answer: string;
  evidence: FinancialAssistantEvidence[];
  limitations: string[];
  requestId: string;
}
