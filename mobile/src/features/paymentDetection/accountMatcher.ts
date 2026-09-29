import type { SQLiteDatabase } from 'expo-sqlite';

import type { LocalFinancialAccountRow } from '../../database/types';
import { normalizeMobileBankSearch } from '../money/bankCatalogData';
import type { ParsedPaymentNotification, PaymentAccountMatch } from './types';

interface AccountLinkRow {
  financial_account_id: string;
}

const SOURCE_MATCH_MINIMUM = 0.8;
const SOURCE_MATCH_AMBIGUITY_MARGIN = 0.05;

function normalized(value: string | null | undefined): string {
  return value ? normalizeMobileBankSearch(value).replace(/[^a-z0-9]/g, '') : '';
}

function sourceMatchesAccount(sourceLabel: string, account: LocalFinancialAccountRow): number {
  const source = normalized(sourceLabel);
  if (!source) return 0;
  const institution = normalized(account.institution);
  const name = normalized(account.name);
  if (institution && source === institution) return 0.92;
  if (name && source === name) return 0.9;
  if (institution && (source.includes(institution) || institution.includes(source))) return 0.84;
  if (name && (source.includes(name) || name.includes(source))) return 0.8;
  return 0;
}

export async function matchPaymentAccount(
  db: SQLiteDatabase,
  event: ParsedPaymentNotification,
): Promise<PaymentAccountMatch> {
  if (event.cardHint) {
    const linked = await db.getFirstAsync<AccountLinkRow>(
      `SELECT link.financial_account_id
       FROM payment_account_links AS link
       JOIN financial_accounts AS account ON account.id = link.financial_account_id
       WHERE link.source_package = ? AND link.card_hint = ?
         AND account.archived = 0 AND account.include_in_net_worth = 1
       LIMIT 1`,
      event.sourcePackage,
      event.cardHint,
    );
    if (linked) return { accountId: linked.financial_account_id, confidence: 0.99, reason: 'card-link' };
  }

  const sourceLinked = await db.getFirstAsync<AccountLinkRow>(
    `SELECT link.financial_account_id
     FROM payment_account_links AS link
     JOIN financial_accounts AS account ON account.id = link.financial_account_id
     WHERE link.source_package = ? AND link.card_hint = ''
       AND account.archived = 0 AND account.include_in_net_worth = 1
     LIMIT 1`,
    event.sourcePackage,
  );
  if (sourceLinked) return { accountId: sourceLinked.financial_account_id, confidence: 0.96, reason: 'source-link' };

  const accounts = await db.getAllAsync<LocalFinancialAccountRow>(
    `SELECT * FROM financial_accounts
     WHERE archived = 0 AND include_in_net_worth = 1
     ORDER BY created_at, id`,
  );
  const ranked = accounts
    .map((account) => ({ account, score: sourceMatchesAccount(event.sourceLabel, account) }))
    .filter((item) => item.score >= SOURCE_MATCH_MINIMUM)
    .sort((left, right) => right.score - left.score || left.account.id.localeCompare(right.account.id));

  const best = ranked[0];
  if (best) {
    const runnerUp = ranked[1];
    if (runnerUp && best.score - runnerUp.score <= SOURCE_MATCH_AMBIGUITY_MARGIN) {
      return { accountId: null, confidence: 0, reason: 'ambiguous-institution' };
    }
    return { accountId: best.account.id, confidence: best.score, reason: 'institution-name' };
  }

  const spendable = accounts.filter((account) => account.account_type !== 'cash');
  if (spendable.length === 1) {
    return { accountId: spendable[0]!.id, confidence: 0.62, reason: 'only-active-account' };
  }
  return { accountId: null, confidence: 0, reason: 'ambiguous' };
}
