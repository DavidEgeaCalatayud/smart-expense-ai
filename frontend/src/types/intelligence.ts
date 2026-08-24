export type FindingType = 'recurring_pattern' | 'duplicate_subscription' | 'spending_anomaly';
export type FindingSeverity = 'info' | 'warning' | 'high';
export type FindingStatus = 'open' | 'dismissed' | 'resolved';

export interface IntelligenceFinding {
  id: string;
  type: FindingType;
  severity: FindingSeverity;
  status: FindingStatus;
  title: string;
  explanation: string;
  evidence: Record<string, unknown>;
  ruleVersion: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  resolvedAt: string | null;
}

export interface IntelligenceSummary {
  openCount: number;
  recurringCount: number;
  duplicateSubscriptionCount: number;
  anomalyCount: number;
  dismissedCount: number;
  resolvedCount: number;
  lastScanAt: string | null;
  analyzedTransactions: number;
  ruleVersion: string;
}

export interface IntelligenceScanResult {
  scanId: string;
  ruleVersion: string;
  analyzedTransactions: number;
  detectedFindings: number;
  scannedAt: string;
}
