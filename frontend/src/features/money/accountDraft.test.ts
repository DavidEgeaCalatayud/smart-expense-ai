import { describe, expect, it } from 'vitest';
import type { FinancialAccount, FinancialAccountDraft } from '../../types/financialAccounts';
import {
  buildFinancialAccountEditPayload,
  purposeForAccountType,
  suggestedAccountNameForInstitution,
} from './accountDraft';

const ORIGINAL: FinancialAccount = {
  id: 'account-1',
  name: 'Bankinter',
  institution: 'Bankinter',
  accountType: 'checking',
  purpose: 'daily',
  currentBalance: '1000.00',
  currency: 'EUR',
  includeInNetWorth: true,
  archived: false,
  balanceUpdatedAt: '2026-09-27T20:00:00Z',
  createdAt: '2026-09-27T20:00:00Z',
  updatedAt: '2026-09-27T20:00:00Z',
};

function draft(overrides: Partial<FinancialAccountDraft> = {}): FinancialAccountDraft {
  return {
    name: ORIGINAL.name,
    institution: ORIGINAL.institution ?? '',
    accountType: ORIGINAL.accountType,
    purpose: ORIGINAL.purpose,
    currentBalance: ORIGINAL.currentBalance,
    currency: 'EUR',
    includeInNetWorth: ORIGINAL.includeInNetWorth,
    ...overrides,
  };
}

describe('financial account edit payload', () => {
  it('does not resend an untouched balance during a metadata-only edit', () => {
    const payload = buildFinancialAccountEditPayload(ORIGINAL, draft({ name: 'Cuenta principal' }));

    expect(payload.name).toBe('Cuenta principal');
    expect(payload).not.toHaveProperty('currentBalance');
  });

  it('includes the balance only when the user actually changes it', () => {
    const payload = buildFinancialAccountEditPayload(ORIGINAL, draft({ currentBalance: '1.250,50' }));

    expect(payload.currentBalance).toBe('1250.50');
  });

  it('treats equivalent decimal spellings as an unchanged balance', () => {
    const payload = buildFinancialAccountEditPayload(ORIGINAL, draft({ currentBalance: '1000,0' }));

    expect(payload).not.toHaveProperty('currentBalance');
  });

  it('forces broker accounts into the investment purpose', () => {
    expect(purposeForAccountType('broker', 'opportunities')).toBe('investment');
    expect(buildFinancialAccountEditPayload(
      ORIGINAL,
      draft({ accountType: 'broker', purpose: 'daily' }),
    ).purpose).toBe('investment');
  });
});

describe('institution-generated account names', () => {
  it('updates a name that was automatically copied from the previous institution', () => {
    expect(suggestedAccountNameForInstitution('Trade Republic', 'Trade Republic', 'Bankinter'))
      .toBe('Bankinter');
  });

  it('fills an empty account name', () => {
    expect(suggestedAccountNameForInstitution('', '', 'Bankinter')).toBe('Bankinter');
  });

  it('preserves a custom account name when the institution changes', () => {
    expect(suggestedAccountNameForInstitution('Inversiones largo plazo', 'Trade Republic', 'Bankinter'))
      .toBe('Inversiones largo plazo');
  });
});
