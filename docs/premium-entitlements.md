# Premium entitlements v1

Phase 6A introduces the subscription-ready entitlement boundary without adding a payment provider or changing existing product access.

## Principles

- FastAPI/PostgreSQL remain the server-authoritative source for account plan state.
- Existing browser and mobile authentication contracts are unchanged.
- No current feature is paywalled in this phase.
- Limits are published in `observe_only` mode. They are product-policy inputs, not enforcement rules yet.
- Planned premium features distinguish **eligibility** from **release state**. A premium account can be eligible for a feature while `enabled` remains `false` until that feature is actually shipped.
- No payment-provider customer/subscription identifiers are stored before a provider is deliberately selected.

## Account state

`users` now persists:

- `plan_tier`: `free` or `premium`
- `subscription_status`: `none`, `trialing`, `active`, `past_due` or `canceled`
- `subscription_current_period_end`: optional provider-neutral period boundary

All existing accounts migrate to `free` / `none`.

`plan_tier` is the entitlement source of truth in Phase 6A. A later billing integration will own the state transition rules that update this field; those rules are intentionally not guessed here.

## Policy contract

Authenticated clients can read:

`GET /api/v2/entitlements`

The response is versioned with `policyVersion = premium-entitlements-v1` and currently reports `enforcementMode = observe_only`.

### Free limits

| Limit | Free |
| --- | ---: |
| CSV imports / month | 5 |
| Custom categories | 25 |
| Budgets / month | 25 |
| Historical window | 12 months |
| Financial Assistant queries / day | 20 |

### Premium limits

| Limit | Premium |
| --- | ---: |
| CSV imports / month | 100 |
| Custom categories | 250 |
| Budgets / month | 250 |
| Historical window | 60 months |
| Financial Assistant queries / day | 200 |

These values are deliberately centralized in `app.services.entitlement_service`. Changing them requires a policy-version review before enforcement is introduced.

## Feature flags

The first premium-only feature keys are:

- `advancedInsights`
- `exportableReports`

Both are intentionally unreleased in Phase 6A. Therefore:

- Free: `eligible=false`, `enabled=false`
- Premium: `eligible=true`, `enabled=false`

When a feature is actually implemented, its release state can be changed independently from plan eligibility.

## Non-goals

Phase 6A does **not**:

- select Stripe, Paddle or another payment provider;
- create checkout, invoices, webhooks or billing portals;
- enforce quota failures;
- remove any feature that users can currently access;
- ship advanced insights or exportable reports merely because their entitlement keys exist.

Provider research, billing synchronization, quota enforcement and premium product surfaces remain separate milestones.
