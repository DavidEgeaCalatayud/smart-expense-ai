# Advanced Insights

`advanced-financial-insights-v1` is the Premium, server-composed insight contract for Smart Expense AI. It does not introduce a second financial engine, an LLM summary layer, or an unevaluated predictive model. It composes evidence already owned by authenticated backend domains into a prioritized monthly view.

## Entitlement

The feature is exposed through `premium-entitlements-v1` as `advancedInsights`. Free accounts remain in the truthful locked state (`eligible=false`, `enabled=false`); Premium accounts receive `eligible=true`, `enabled=true`. Quota enforcement remains `observe_only`.

## API

`GET /api/v2/insights/advanced?month=YYYY-MM`

The endpoint requires authentication and an enabled `advancedInsights` entitlement. The authenticated user ID is derived from the server session and never accepted from request parameters.

The response includes:

- `insightVersion=advanced-financial-insights-v1`;
- selected month and EUR currency;
- deterministically ordered insight cards;
- typed evidence metrics (`currency`, `percent`, `count`, `text`);
- source-contract identifiers;
- explicit interpretation limitations.

## Current signal set

The v1 composer can emit five kinds of cards:

1. `budget_pressure` — uses the existing budget service and reports only stored budget progress. An `attention` priority is used only when a configured budget is already over its limit; no speculative warning threshold is invented.
2. `open_findings` — summarizes the latest persisted Financial Intelligence state. The endpoint does not trigger a new `rules-v2` scan.
3. `cash_flow` — compares exact selected-month income and expenses from `monthly-financial-report-v1`.
4. `expense_change` — compares exact selected-month expenses with the immediately previous calendar month. Direction follows the sign of the exact delta; the percentage is omitted when the previous-month denominator is zero.
5. `category_concentration` — surfaces the largest expense category and its exact share of selected-month expenses without labeling concentration as inherently good or bad.

Cards are ordered first by explicit priority (`attention`, `positive`, `info`) and then by a stable kind order. The same stored evidence therefore produces the same ordering.

## Exact-money boundary

All financial aggregation remains in FastAPI/PostgreSQL domain services using PostgreSQL `NUMERIC` / Python `Decimal`. The advanced-insights response serializes monetary metrics as decimal strings. The web client only formats those strings for display; it does not recompute net, deltas, shares, budget utilization, or other financial arithmetic.

## Evidence and account isolation

The composer reuses:

- `monthly-financial-report-v1` for monthly income, expenses, net and category totals;
- the existing budget service for account-owned monthly budget progress;
- the persisted Financial Intelligence summary and its current `rules-v2` contract.

Every source call receives the authenticated `current_user.id`. There is no request field that can select another account, and integration coverage explicitly verifies that another user's transaction amounts never appear in the response.

## Deliberate limitations

- The endpoint is deterministic decision support, not financial advice.
- It does not run a new Financial Intelligence scan; findings describe the latest persisted scan.
- It does not create probabilistic forecast confidence or reuse synthetic benchmark metrics as user confidence.
- The selected month summarizes all transactions currently stored inside that calendar month. It does not apply an `asOf` cutoff.
- `category_concentration` is descriptive only; v1 does not assert that a high share is harmful.

## Web UX

The protected `/insights` workspace verifies entitlements before requesting Premium data. It distinguishes three states that must not be conflated:

- entitlement lookup/network failure;
- a genuine Free/no-entitlement lock;
- an enabled Premium account whose insight request fails.

The screen renders the backend-provided title, summary, evidence labels and typed metric values. It exposes no fake checkout action while billing activation is not part of the product.

## Test contract

The required regression surface covers:

- authentication and Free/Premium authorization;
- entitlement release semantics;
- exact Decimal-derived cash-flow and month-over-month metrics;
- budget-overrun composition;
- category concentration;
- account isolation and month validation;
- locked/enabled/access-error component states;
- persisted Playwright coverage of the real Free entitlement boundary.
