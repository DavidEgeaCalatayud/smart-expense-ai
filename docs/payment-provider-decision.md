# Subscription billing provider decision

Status: accepted architecture decision for Phase 6B research; no payment integration is introduced by this document.

Reviewed: 2026-09-02.

## Decision

Smart Expense AI will keep **FastAPI/PostgreSQL as the single authority for account entitlements** and will treat payment systems as external billing sources rather than as the product authorization model.

The initial provider direction is:

- **Web subscriptions:** prefer **Paddle Billing** for the first production subscription integration because its Merchant of Record model removes a substantial amount of VAT/sales-tax registration, calculation, filing and remittance work from a small SaaS operation.
- **Android distributed through Google Play:** use **Google Play Billing** for in-app Premium subscriptions by default. Smart Expense AI sells digital financial-management functionality, which Google explicitly lists inside the payment-policy scope. EEA external-offer/alternative-billing programs exist, but they have separate enrollment, UX, reporting and fee requirements and are not the default implementation path.
- **RevenueCat:** do not make it a Phase 6 dependency. Reassess it when iOS or multi-store subscription lifecycle complexity justifies an additional abstraction layer.
- **Stripe:** retain as the preferred fallback for web if lower processing cost, direct merchant control or Paddle product eligibility/underwriting becomes more important than Merchant of Record simplicity.

This is an engineering/product decision, not tax or legal advice. Store policies, provider eligibility, tax obligations and pricing must be revalidated immediately before production launch.

## Why the backend remains authoritative

Phase 6A already introduced provider-neutral `plan_tier`, `subscription_status` and `subscription_current_period_end`. Those fields must remain a product projection, not a copy of one provider's schema.

Future billing integrations should follow this flow:

```text
Paddle webhook -----------\
                          \
Google Play purchase ------> verified billing event -> canonical subscription state -> entitlements
                          /
Future App Store event ---/
                         /
Stripe webhook ----------/
```

The web or mobile client may start a purchase and display provider UX, but it must never grant Premium access merely because a client reports a successful purchase. Premium access changes only after server-side verification/reconciliation.

## Provider comparison

### Paddle Billing

Paddle's standard pay-as-you-go Checkout price is **5% + USD 0.50 per transaction**. Paddle acts as Merchant of Record and states that it handles payment processing plus tax registration, calculation, collection, filing and remittance across supported jurisdictions.

Advantages for this project:

- materially smaller tax/compliance operating surface for international SaaS sales;
- subscription billing and checkout are bundled with the Merchant of Record relationship;
- fewer production systems are needed before accepting web subscribers;
- fits a small project better than building tax operations before product-market validation.

Tradeoffs:

- higher marginal fee than a direct PSP such as Stripe;
- Paddle is the seller/merchant of record, which changes the commercial relationship and payout/reconciliation model;
- provider onboarding/product eligibility still has to be accepted before implementation can be considered launch-ready.

### Stripe Billing + Payments

For Spain, Stripe currently lists Billing pay-as-you-go at **0.7% of Billing volume** and standard European online card processing at **1.5% + EUR 0.25**. Stripe Tax is a separate product/cost surface; Stripe's pricing page currently lists Tax Basic at 0.5% per transaction for supported no-code integrations or EUR 0.45 per transaction for API calculations, where applicable.

Advantages:

- lower direct processing/billing cost at ordinary SaaS price points;
- mature subscription lifecycle, Checkout and customer portal;
- direct merchant relationship and high implementation flexibility.

Tradeoffs:

- Smart Expense AI remains responsible for significantly more of the tax/compliance lifecycle than with a Merchant of Record;
- registration/filing obligations are not eliminated by calculating tax;
- more operational work is a poor first optimization while the product is still pre-production.

Stripe therefore remains a strong fallback, but is not the first web choice for Phase 6.

### Google Play Billing

Google's Payments policy says apps distributed through Google Play that sell digital features, subscriptions, cloud software or financial-management software generally must use Google Play Billing unless a specific policy/program exception applies.

For EEA, UK and US transactions from 2026-06-30, Google's current service-fee table lists auto-renewing subscriptions at **10% service fee + 5% billing fee** when Play Billing is used. Google also documents EEA programs for external offers/alternative billing, with their own requirements and service fees.

For Smart Expense AI the default is therefore:

1. a Play-distributed Android build uses Google Play Billing for in-app Premium purchase;
2. no embedded Paddle/Stripe checkout is added to the Play build as a shortcut;
3. any later EEA external-offer strategy is a separate product/legal/compliance decision and must not be silently enabled by configuration.

Direct Android distribution outside Google Play can have a different billing policy, but it is not the Phase 6 launch assumption.

### RevenueCat

RevenueCat currently offers no-cost usage up to **USD 2,500 monthly tracked revenue**, then lists **1% of tracked revenue**. It provides cross-platform subscription infrastructure but does not remove the underlying store/payment-provider economics or make Google Play policy disappear.

It becomes attractive when:

- iOS is added;
- Play/App Store receipt validation and subscription-state edge cases create meaningful maintenance cost;
- cross-platform purchase restoration is required;
- the extra vendor and percentage cost is justified by reduced engineering complexity.

Until then, FastAPI can own the canonical projection directly and avoid another dependency.

## Required future persistence boundary

Do **not** add Paddle/Google/Stripe identifiers directly to `users`.

A future payment implementation should introduce provider-scoped persistence similar to:

```text
billing_customers
- id
- user_id
- provider
- provider_customer_id
- created_at

billing_subscriptions
- id
- user_id
- provider
- provider_subscription_id
- provider_product_id
- provider_price_id / base_plan_id
- status
- current_period_end
- cancel_at_period_end
- last_verified_at
- created_at
- updated_at

billing_events
- id
- provider
- provider_event_id       UNIQUE(provider, provider_event_id)
- event_type
- received_at
- processed_at
- processing_status
- payload_hash
```

Provider payload retention must be minimized: store only fields required for reconciliation/audit, never credentials, and define retention before production.

## Event-processing invariants

Any Phase 6 billing implementation must satisfy all of the following:

- verify provider webhook/signature or purchase authenticity before state mutation;
- make provider events idempotent with a provider event/purchase identifier;
- tolerate duplicate and out-of-order delivery;
- derive entitlements server-side from canonical subscription state;
- never accept `user_id`, plan tier or entitlement scope from an untrusted webhook/client without resolving it through server-owned provider mappings;
- keep financial data/account isolation independent from billing provider identity;
- define grace-period, past-due, cancellation, refund/revocation and restore semantics before enforcement;
- reconcile periodically or on authenticated account access so a missed webhook cannot create permanent drift;
- retain an explicit audit trail of entitlement-changing events without persisting unnecessary payment payloads;
- keep web-cookie and mobile Bearer authentication unchanged by billing.

## Initial product mapping

The first production mapping should stay deliberately small:

```text
Free     -> existing free entitlement policy
Premium  -> existing premium entitlement policy
```

Do not model multiple paid tiers, seat counts, trials, annual discounts or lifetime purchases until the actual product requires them. Billing products/base plans should map to the server-owned `premium` tier rather than becoming authorization rules themselves.

## Rollout sequence

1. Phase 6A: provider-neutral plan/entitlement model — complete.
2. Phase 6B: provider/store decision and billing architecture — this document.
3. Add canonical billing customer/subscription/event persistence and provider-independent state transition tests.
4. Integrate one web provider in sandbox only (Paddle first); verify webhook idempotency, cancellation/refund and reconciliation.
5. Integrate Google Play Billing purchase/restore on Android with server-side verification.
6. Add entitlement enforcement only after billing lifecycle tests are green; keep current `observe_only` behavior until then.
7. Add billing-management UX and operational runbooks.
8. Reassess RevenueCat when iOS/multi-store support becomes active work.

## Rejected shortcuts

- **Stripe/Paddle fields on `users`:** couples product authorization to one vendor and makes Android/iOS awkward.
- **Trusting the mobile purchase callback:** client state is not an authorization source.
- **Using Paddle/Stripe checkout inside the Play app without a policy program:** conflicts with the default Google Play Payments-policy path for digital functionality.
- **Turning Phase 6A limits on immediately:** quota enforcement before billing lifecycle correctness would regress existing users.
- **RevenueCat immediately:** useful later, but unnecessary vendor/cost surface before multi-store complexity exists.
- **A single global `is_premium` boolean:** cannot represent grace period, refund/revocation, cancellation-at-period-end, provider reconciliation or multiple billing sources safely.

## Sources reviewed

Official sources reviewed on 2026-09-02:

- Stripe Billing pricing: https://stripe.com/es/billing/pricing
- Stripe Spain pricing / Stripe Tax: https://stripe.com/es/pricing
- Paddle pricing: https://www.paddle.com/pricing
- Paddle tax/compliance: https://www.paddle.com/billing/tax-and-compliance
- Google Play Payments policy: https://support.google.com/googleplay/android-developer/answer/10281818
- Google Play service fees: https://support.google.com/googleplay/android-developer/answer/112622
- Google Play EEA external offers program: https://support.google.com/googleplay/android-developer/answer/14372887
- RevenueCat pricing: https://www.revenuecat.com/pricing
