# Exportable Reports v1

## Purpose

`monthly-financial-report-v1` is the first Premium report contract. It turns one calendar month of the authenticated user's persisted transaction history into a reproducible server-calculated summary and a downloadable CSV without moving financial arithmetic into the browser.

The report is deliberately deterministic and does not involve the Financial Assistant, an LLM, forecasting, inferred confidence or background report persistence.

## Entitlement boundary

The feature is exposed through `premium-entitlements-v1` as `exportableReports`.

- Free accounts: `eligible=false`, `enabled=false`.
- Premium accounts: `eligible=true`, `enabled=true` once this feature is released.
- Existing quota limits remain `observe_only`; releasing reports does not silently enable CSV-import, category, budget, history-window or Assistant quota enforcement.

Both report endpoints enforce the server-owned entitlement. Hiding or showing a frontend button is not an authorization control.

## API

### Preview

`GET /api/v2/reports/monthly?month=YYYY-MM`

Returns:

- `reportVersion`: `monthly-financial-report-v1`
- `month`
- `currency`: currently `EUR`
- exact decimal-string `totalIncome`
- exact decimal-string `totalExpenses`
- exact decimal-string `net`
- `transactionCount`
- deterministic category/type breakdown with exact totals and counts
- `downloadFilename`

### CSV download

`GET /api/v2/reports/monthly.csv?month=YYYY-MM`

Returns `text/csv` with a private/no-store cache policy and an attachment filename of `smart-expense-report-YYYY-MM.csv`. `Content-Disposition` is explicitly CORS-exposed so the browser can honor the server filename when frontend and API run on different origins.

The CSV contains three sections:

1. report metadata and monthly totals;
2. category/type totals;
3. the month's transaction rows in deterministic chronological order.

## Exact-money and time boundaries

All report arithmetic starts from PostgreSQL `NUMERIC` values and remains Python `Decimal`. JSON uses the existing API-v2 decimal-string representation and CSV values are written with exactly two fractional digits.

The monthly boundary is `[first day of selected month, first day of next month)`. Transactions outside the selected calendar month are excluded even when created or updated during the selected month.

The v1 product remains EUR-only. Multi-currency reporting must not be approximated by summing unrelated currencies and remains a separate product/data-model milestone.

## Account isolation

Every report query includes the authenticated `current_user.id` before transaction rows are loaded. A report cannot accept a user/account identifier from the client, and transactions from another account are not visible in either preview or CSV output.

The generated report is not persisted as a separate database object. It is derived on request from the current authoritative account data, which avoids creating another sensitive-data retention surface.

## Spreadsheet safety

CSV values originating from user-controlled text are protected against spreadsheet formula execution. Merchant, category and description fields beginning with `=`, `+`, `-`, `@`, tab, carriage-return or newline are prefixed with an apostrophe before CSV serialization.

This rule is output-specific and does not modify the persisted transaction text.

## Frontend behavior

The protected **Reports** workspace first reads the server entitlement contract.

- Free accounts see a truthful locked state explaining that report export requires Premium. The application does not display a fake checkout or simulated upgrade action while billing activation remains a separate milestone.
- Premium accounts receive the selected month's server preview and may download the corresponding CSV.
- Browser-side code formats already-calculated decimal strings only for presentation; it does not recompute financial totals.
- The initial reporting month is derived from the browser's local calendar rather than UTC so users near a timezone/month boundary do not land on the wrong month.

## Validation

Required coverage includes:

- authentication enforcement;
- Free/Premium entitlement behavior;
- exact Decimal monthly totals;
- calendar-month exclusion;
- category breakdown;
- account isolation;
- deterministic filename/content type;
- spreadsheet-formula escaping;
- frontend locked and enabled states;
- frontend CSV download behavior.
