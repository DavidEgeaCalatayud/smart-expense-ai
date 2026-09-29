import type {
  FinancialAccount,
  FinancialAccountDraft,
  FinancialAccountPurpose,
  FinancialAccountType,
} from '../../types/financialAccounts';
import { normalizeMoneyAmount } from '../../utils/money';

export function purposeForAccountType(
  accountType: FinancialAccountType,
  requestedPurpose: FinancialAccountPurpose,
): FinancialAccountPurpose {
  return accountType === 'broker' ? 'investment' : requestedPurpose;
}

export function suggestedAccountNameForInstitution(
  currentName: string,
  currentInstitution: string,
  nextInstitution: string,
): string {
  const cleanName = currentName.trim();
  const cleanInstitution = currentInstitution.trim();
  if (!cleanName || (cleanInstitution !== '' && cleanName === cleanInstitution)) {
    return nextInstitution;
  }
  return currentName;
}

export function buildFinancialAccountEditPayload(
  original: FinancialAccount,
  draft: FinancialAccountDraft,
): {
  name: string;
  institution: string | null;
  accountType: FinancialAccountType;
  purpose: FinancialAccountPurpose;
  currentBalance?: string;
  includeInNetWorth: boolean;
} {
  const currentBalance = normalizeMoneyAmount(draft.currentBalance);
  const originalBalance = normalizeMoneyAmount(original.currentBalance);

  return {
    name: draft.name.trim(),
    institution: draft.institution.trim() || null,
    accountType: draft.accountType,
    purpose: purposeForAccountType(draft.accountType, draft.purpose),
    ...(currentBalance !== originalBalance ? { currentBalance } : {}),
    includeInNetWorth: draft.includeInNetWorth,
  };
}
