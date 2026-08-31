# Roadmap

This roadmap tracks implemented, validated and deliberately pending product/engineering work. A checked item means the capability is present on `main` or is validated as part of the pull request that checks it; design intent alone is not enough.

## Phase 0 - Foundations

See the repository history and release notes for the completed project foundations.

## Phase 1 - Core financial product

The current web application, FastAPI domain layer, PostgreSQL persistence, authentication, imports, categories, budgets and versioned transaction APIs are implemented and covered by the main quality gate.

## Phase 2 - Security and account lifecycle

Core authentication/session rotation, privacy export/deletion and request hardening are implemented. Password recovery and MFA remain future work where called out elsewhere in product planning.

## Phase 3 - Financial Intelligence

The production-authoritative deterministic intelligence stack (`rules-v2`, `historical-v2.2`, recurring lifecycle/calendar and persisted findings) is implemented. Independent modern labelled validation/calibration and background server scheduling remain future evaluation work.

## Phase 4 - Forecasting and ML challengers

Deterministic spending forecast baselines, causal walk-forward evidence, category suggestion classification and anomaly challengers are implemented and benchmarked. Continue evaluating forecasting challengers without displaying probabilistic confidence until a separately evaluated calibration contract exists.

- [ ] Evaluate Ridge/Random Forest/Gradient Boosting or other forecasting challengers on the established causal protocol.
- [ ] Do not display probabilistic forecast confidence until it has a separately evaluated calibration contract.

## Phase 5 - Mobile & Offline-First

Goal: evolve the project into a multi-client financial platform with an Android-first React Native client while keeping FastAPI/PostgreSQL as the single financial source of truth.

### Phase 5A - Foundation and sync contract

- [x] Define the multi-client repository boundary: existing `frontend/`, new `mobile/` and incremental `shared/` contracts.
- [x] Define `sync-v1` around server-owned opaque cursors instead of client/device timestamps.
- [x] Define mutation idempotency, delete tombstones, client-generated UUIDs and explicit stale-version conflict semantics.
- [x] Define exact API decimal-string <-> SQLite integer minor-unit money conversion without binary-float arithmetic.
- [x] Keep Financial Intelligence, historical analysis, forecasting, classifier inference and Financial Assistant server-owned rather than reimplementing them in mobile.
- [x] Document the local SQLite replica/outbox/state/conflict boundaries and foreground sync sequence.

### Phase 5B - Expo + SQLite foundation

- [x] Scaffold the Android-first React Native + Expo application under `mobile/` without changing the existing web build.
- [x] Pin the Expo/React Native/React dependency set through the Expo toolchain and add Expo Router.
- [x] Add versioned SQLite migrations, foreign keys and WAL mode.
- [x] Add local repositories for transactions, categories and budgets behind a mobile repository boundary.
- [x] Add durable `sync_outbox`, `sync_state` and `sync_conflicts` persistence.
- [x] Add secure device credential storage and define the SQLCipher/native encrypted-database production path.
- [x] Add mobile unit/type/lint/export validation to CI.

### Phase 5C - Backend synchronization and mobile authentication

- [x] Add server-owned sync versions for syncable entities.
- [x] Add authenticated sync device/mutation/change-journal persistence with Alembic migrations.
- [x] Add idempotent bounded `POST /api/v2/sync/push`.
- [x] Add cursor-based bounded `GET /api/v2/sync/pull` with delete tombstones and no gaps/duplicates.
- [x] Add a consistent paginated bootstrap path and typed sync-cursor recovery.
- [x] Add a mobile-appropriate short-lived access/rotating-refresh credential flow while preserving the existing HttpOnly browser-cookie flow.
- [x] Reuse current session-version/password-change/account-deletion revocation semantics for mobile credentials.
- [x] Regression-test cross-account isolation, stale conflicts, retries, concurrent web/mobile writes and exact Decimal money.

### Phase 5D - Offline transaction vertical slice

- [x] Add Android authentication/session bootstrap.
- [x] Add local-first transaction list/form flows.
- [x] Support offline transaction create/edit/delete with client-generated UUIDs.
- [x] Implement foreground push/pull synchronization with bounded retry/backoff.
- [x] Preserve the durable outbox across app/process termination.
- [x] Surface pending/failed/conflict state explicitly in the UI.
- [x] Add explicit conflict resolution instead of silent last-write-wins.
- [ ] Prove the complete offline/reconnect/conflict flow on a real Android emulator/device inside the required quality gate.

### Phase 5E - Categories and budgets

- [x] Replicate system/account-owned categories while preserving server ownership and conservative archive/reassign rules.
- [x] Support allowed offline custom-category mutations and relationship ordering with pending transactions.
- [x] Replicate budgets with exact minor-unit local storage and server-authoritative invariants.
- [x] Add category/budget sync conflict and cross-account tests.

### Phase 5F - Server-derived mobile workspaces

- [x] Add dashboard analytics.
- [x] Add Financial Intelligence findings/review UX without porting `rules-v2`.
- [x] Add Historical Analysis without porting `historical-v2.2`.
- [x] Add upcoming recurring payments and spending forecast using existing backend contracts.
- [x] Add category suggestions as user-controlled server-backed suggestions.
- [x] Add the stateless Financial Assistant using the existing evidence-grounded backend boundary.
- [x] Cache selected latest server-derived responses only as explicitly read-only mobile UX state.

### Phase 5G - Android production hardening

- [ ] Add production local-database encryption and verify logout/account-deletion local data wipe.
- [ ] Add background synchronization as a best-effort optimization while preserving foreground sync as the correctness path.
- [ ] Add account-switch/device-isolation tests.
- [ ] Add mobile security/privacy review and ensure no backend/provider secrets are shipped in the application.
- [ ] Add Android native development/release build validation, signing strategy and distributable AAB profile.
- [ ] Add Android offline/reconnect/conflict E2E coverage to the required quality gate.
- [ ] Keep the architecture portable to a future iOS client without making iOS a Phase 5 release blocker.

## Phase 6 - Premium SaaS Preparation

Goal: prepare the project for a subscription-based model.

- [ ] Define free and premium limits.
- [ ] Add premium feature flags.
- [ ] Add subscription-ready user model.
- [ ] Add payment provider research.
- [ ] Add exportable reports.
- [ ] Add advanced insights.

## Phase 7 - Production Readiness

Goal: prepare the project for real deployment.

- [x] Add backend and frontend automated tests.
- [x] Add GitHub Actions CI and require the frontend chain `Vitest -> TypeScript -> ESLint -> build` inside CI.
- [x] Validate Alembic migrations against PostgreSQL in CI.
- [x] Add critical Playwright end-to-end coverage, including password/session rotation, category/budget/import/suggestion flows, recurring calendar, month-end forecast and the stateless Financial Assistant request/evidence contract.
- [x] Add Docker Compose and validate the full stack in CI.
- [x] Add `SECURITY.md`, Dependabot, Python/npm vulnerability audits, immutable Action SHAs, HTTP security headers and baseline OWASP Top 10:2025 review.
- [x] Add API v1/v2 contract documentation and decimal-money/Docker smoke coverage.
- [x] Gate historical-v2.2, lifecycle/occurrence evaluation, sealed splits/fingerprints/bootstrap and `rules-v2` behavior.
- [x] Gate `tfidf-logreg-v1` with chronological, merchant-group cold-start, calibration and sealed synthetic-holdout evidence.
- [x] Gate the `private-real-data-v1` loader/evaluator plus `private-real-data-evidence-v1` metric/privacy/readiness contract with temporary synthetic data that cannot claim real provenance.
- [x] Gate `berka-real-data-v1` parser/provenance/causal-cutoff/report-privacy behavior with synthetic temporary relations while keeping the raw public dataset outside CI/repository storage.
- [x] Gate `recurring-calendar-v1` with backend, component and persisted Playwright coverage.
- [x] Gate `spending-forecast-v1` with backend unit/integration tests, Predictions component/E2E coverage and a dedicated deterministic forecast benchmark workflow.
- [x] Gate `isolation-forest-v1` with future-leakage regressions, same-support comparison metrics, non-promotion assertions and a dedicated anomaly challenger workflow.
- [x] Gate Financial Assistant v1 user-scope/evidence-grounding contracts with fake-provider unit tests, PostgreSQL account-isolation integration coverage, component tests and critical Playwright coverage without external provider calls.
- [x] Gate current analysis/model contract aliases and critical documentation consistency in backend tests.
- [x] Add privacy/data-handling policy draft with production placeholders.
- [x] Generate reproducible, validated backend/frontend CycloneDX dependency SBOMs and retain the artifact in CI.
- [ ] Configure `Quality gate` as a required branch-protection check for `main`.
- [ ] Declare the first semantic-version tag/GitHub Release when the project intentionally reaches a stable release boundary.
- [ ] Add staging deployment.
- [ ] Add production TLS/domain/secrets configuration.
- [ ] Add centralized security monitoring and alerting.
- [ ] Add container image vulnerability scanning and image-level SBOM/provenance generation.

## Long-Term Ideas

- Bank account integration.
- Email receipt analysis.
- Multi-currency support.
- Shared household accounts.
- Budget recommendations.
- Goal-based saving plans.
