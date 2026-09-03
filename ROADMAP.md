# Roadmap

## Phase 0 - Project Foundation

Goal: prepare the repository and define the product direction.

- [x] Create repository.
- [x] Add README and product documentation.
- [x] Define the current technical stack.
- [x] Create backend base project with FastAPI.
- [x] Create frontend base project with React and TypeScript.
- [x] Add environment configuration.
- [x] Add Docker configuration.
- [x] Add an explicit MIT `LICENSE` for the public repository.
- [x] Add `CHANGELOG.md` with an `Unreleased` workflow instead of inventing retrospective releases.
- [x] Centralize current analysis/model identifiers in `backend/app/analysis_contracts.py` and document their ownership/change procedure.
- [x] Replace stale proposed architecture/version documentation with implementation-aligned technical documentation.

## Phase 1 - Persistent MVP Core

Goal: make the first usable version persist real financial data.

- [x] Define transaction and category models.
- [x] Add PostgreSQL persistence with SQLAlchemy 2 and Alembic migrations.
- [x] Seed initial categories and support system/account-owned category lifecycle.
- [x] Create authenticated transaction CRUD endpoints and connect the Transactions page.
- [x] Validate category/type compatibility.
- [x] Build dashboard metrics, six-month expense series and recent persisted transactions.
- [x] Add server-side pagination, search, category/status/type/recurring/date filters and sorting.
- [x] Add aggregate summary/monthly-expense endpoints.
- [x] Add normalized API errors with semantic codes/request IDs and typed frontend handling.
- [x] Version the supported application API under `/api/v1` and add `/api/v2` decimal-string financial contracts.
- [x] Keep money as PostgreSQL `NUMERIC` / Python `Decimal` through financial services and use fixed-point frontend arithmetic.
- [x] Add responsive transaction cards while preserving the dense desktop table.
- [x] Add authenticated transactional CSV import with detection, mapping, preview, normalization, atomic commit, duplicate fingerprints and import lineage.
- [x] Add delete confirmation, operation feedback and distinct loading/refresh/retry/mutation states.
- [x] Add user-managed custom categories with case-insensitive conflicts, rename, archive/reassign and restore semantics.
- [x] Add persisted monthly overall and per-expense-category budgets with Decimal limits and server-calculated progress.

## Phase 2 - Accounts and Data Ownership

Goal: isolate financial data by user before adding sensitive integrations.

- [x] User registration, login and logout.
- [x] Signed JWT session stored in an HttpOnly cookie.
- [x] Argon2 password hashing.
- [x] Add mandatory user ownership to transactions and scope reads/writes by authenticated user ID.
- [x] Require authentication for financial/category API reads.
- [x] Keep seeded categories global/read-only while allowing account-owned custom categories.
- [x] Add authenticated session visibility in the Security page.
- [x] Cover cross-account transaction isolation in integration and E2E tests.
- [x] Harden authentication errors, password policy, JWT claims, trusted hosts, CORS and cross-site mutation protection.
- [x] Add authentication rate limiting at the trusted edge.
- [x] Add password change with server-side session-version revocation and current-session rotation.
- [ ] Add verified password reset/recovery after an email delivery channel exists.
- [x] Add account deletion and authenticated `privacy-export-v1` controls.
- [x] Regression-test privacy export isolation across transactions, findings, scans, historical snapshots, imports, categories, budgets and category-suggestion feedback.
- [ ] MFA if required for Internet-facing production use.

## Phase 3 - Financial Intelligence

Goal: implement real analysis and evaluated ML baselines without simulated AI outputs.

- [x] Detect recurring transactions, duplicate subscriptions and abnormal transaction amounts from historical data.
- [x] Add persisted intelligence findings/scan history, severity, explainable evidence, review workflow and stable idempotent fingerprints.
- [x] Keep findings isolated by authenticated user ownership and expose the Financial Intelligence workspace.
- [x] Remove floating-point money calculations from intelligence evidence.
- [x] Add versioned persisted historical-analysis snapshots and complete-month trend/category-shift analysis.
- [x] Add auditable merchant canonicalization and merchant-specific prior-only amount anomaly evidence (`merchant_mad_plus_extreme_iqr_v1`).
- [x] Make recurrence calendar-aware with day-of-month/month-end/day-of-week stability, amount MAD/CV, consecutive periods and missed expected occurrences.
- [x] Add labelled chronological walk-forward evaluation with precision, recall, F1, false positives per 100, false negatives and performance slices.
- [x] Add `historical-v2.1` fold-local merchant identity so future descriptors never leak into evaluation.
- [x] Add temporal recurrence ground truth, descriptor/amount multi-stream segmentation and compatibility-readable stream evidence.
- [x] Add `historical-v2.2` temporal-phase clustering for equal-merchant/equal-amount streams with repeated concurrent-calendar evidence requirements.
- [x] Preserve recurring stream identity across qualified price changes and model cancellation/dormancy/reactivation as lifecycle episodes.
- [x] Expose recurrence segmentation as `lifecycle-v1` with lifecycle, price-continuity, descriptor/amount and temporal-phase evidence.
- [x] Replace order-dependent recurring-label matching with deterministic optimal bipartite assignment and permutation-invariance regressions.
- [x] Add prospective occurrence-level evaluation with prior-only baselines, occurrence precision/recall/F1, missed/extra predictions, date MAE/bias and Decimal amount MAE/MAPE.
- [x] Add explicit date/amount occurrence ground truth while keeping date-only labels backward-compatible.
- [x] Add calibration/validation/final-holdout ranges, physically sealed holdout rows and SHA-256-fingerprinted frozen parameters.
- [x] Add 95% month-block bootstrap confidence intervals with support/block counts and tampering/split/determinism regressions.
- [x] Upgrade actionable findings to `rules-v2` using canonical merchants and shared recurrence primitives.
- [x] Add separate `recurring_payment_missing`, merchant-only amount anomaly and `frequency_anomaly` findings plus summary/API/UI/test coverage.
- [x] Add reusable `tfidf-logreg-v1` merchant-text category classification as an explicit user-controlled suggestion rather than automatic assignment.
- [x] Evaluate category classification chronologically with calibration/validation/sealed holdout metrics and per-category/confusion/seen-vs-unseen slices.
- [x] Persist suggestion acceptance/correction labels atomically with model/feature provenance.
- [x] Add per-user canonical-merchant personalization, including account-owned categories learned only from that user's feedback history.
- [x] Add canonical merchant-group-disjoint cold-start evaluation with zero train/evaluation group overlap.
- [x] Measure raw, Platt and isotonic probability calibration with multiclass Brier score, ECE and reliability bins while keeping product confidence disabled.
- [x] Gate chronological, cold-start, calibration and sealed-holdout classifier contracts in CI and document synthetic-data limitations.
- [x] Add `private-real-data-v1`: git-ignored private dataset contract and aggregate-only local evaluator for classifier, `rules-v2` and `historical-v2.2`.
- [x] Regression-test the private evaluator with temporary synthetic data so CI proves holdout sealing and report sanitization without private records.
- [x] Add `private-real-data-evidence-v1`, surfacing classification accuracy/macro-F1/unseen-merchant F1/calibration, observed suggestion acceptance/correction, combined transaction-level anomaly metrics and occurrence precision/recall/date-MAE/amount-MAE from the existing evaluators.
- [x] Add private evidence provenance, current-model feedback filtering, separate dataset/evidence fingerprints, aggregate-only public summary output and explicit real/final-holdout readiness gates that synthetic CI fixtures cannot satisfy.
- [x] Add `berka-real-data-v1` as reproducible `real_public_historical` evidence over the PKDD'99 Berka banking dataset, retaining aggregate metrics and source fingerprints without committing raw financial rows.
- [x] Evaluate previous-three-month mean vs day-15 run rate on 171,826 real account-month folds and preserve the negative result that the transparent three-month mean materially outperforms the run-rate baseline on this source.
- [x] Link 5,788 bank permanent orders to realized outgoing transfers and report a prior-only calendar standing-order reference baseline, explicitly separated from any `historical-v2.2` production-quality claim.
- [ ] Run `private-real-data-v1` against a genuinely independent/private labelled transaction dataset and retain only aggregate evidence outside the ignored private directory.
- [ ] Validate `rules-v2` and `historical-v2.2` production algorithms against independently labelled modern real-world data and measure precision/recall/false-positive rates.
- [ ] Validate category classification and probability calibration against independent/real labelled transactions with meaningful natural unseen-merchant support before confidence or optional automatic assignment.
- [ ] Tune recurring-score weights/cutoffs, stream-clustering tolerances and anomaly thresholds only on labelled calibration data, use validation for design checks, then open holdout once for final reporting.
- [ ] Reassess amount-anomaly distribution fences and frequency-anomaly policy from real-world false-positive cost before loosening them.
- [ ] Add automatic/background analysis when deployment scheduling is available.
- [x] Evaluate `isolation-forest-v1` as an offline anomaly challenger using `causal-transaction-features-v1`, strict prior-only feature state, disjoint fit/calibration/evaluation windows and deterministic model configuration.
- [x] Compare `rules-v2`, `isolation-forest-v1` and `rules-v2-or-isolation-forest-v1` on identical labelled observations with precision, recall, F1, false positives per 100, confusion counts and history-depth slices.
- [x] Enforce that synthetic challenger evidence never auto-replaces `rules-v2`; production promotion still requires representative independently labelled real evidence and acceptable false-positive cost.
- [x] Add stateless Financial Assistant v1 with `POST /api/v2/assistant/query`, structured answers, canonical evidence references and a protected frontend workspace.
- [x] Expose six strict read-only assistant tools over authenticated transaction analytics, exact period comparison, budgets, persisted `rules-v2` findings, persisted `historical-v2.2` insights and bounded transaction search.
- [x] Keep authenticated user identity outside every LLM tool schema, derive scope from `current_user.id`, compute financial arithmetic server-side with `Decimal` and filter model-invented evidence references.
- [x] Isolate provider-specific Responses API code behind an `LLMProvider` boundary, keep provider configuration optional/backend-only and retain a stateless no-RAG/no-memory/no-multi-agent v1 contract.

## Phase 4 - Prediction and Upcoming Payments

Goal: turn existing recurrence evidence into visible product value and establish transparent month-end forecasting baselines before predictive ML.

- [x] Add `recurring-calendar-v1`, reusing cadence, expected occurrence, amount stability, lifecycle and price-continuity evidence rather than inventing a new model.
- [x] Show `expected`, `likely`, `overdue` and `price_changed` states plus exact future-only totals; keep overdue/dormant schedules separate until activity resumes.
- [x] Add `spending-forecast-v1` as the versioned overall month-end forecast contract.
- [x] Add a three-complete-month mean baseline for estimated month-end spending.
- [x] Add a current-month run-rate baseline: `spent_so_far / elapsed_days * days_in_month` with explicit calendar-day/partial-month assumptions.
- [x] Add a recurrence-aware baseline that keeps observed spend once, projects remaining variable spend and adds qualified future recurring payments.
- [x] Prevent forecast leakage by discarding transactions after `asOf` and separating recurring-history cutoff from the future projection-window start.
- [x] Walk-forward backtest all forecasting baselines on identical fixed day-15 chronological folds with MAE, sMAPE and signed bias.
- [x] Compare forecasted spending with the previous-three-month mean and expose assumptions/evidence/backtest error rather than a bare number.
- [x] Add a dedicated reproducible `spending-forecast-benchmark-v1` workflow plus backend/API/component/persisted Playwright coverage.
- [x] Establish the ML promotion gate: any future forecasting challenger must consistently beat transparent baselines on the same chronological folds/support before product use.
- [x] Add public observed historical evidence for the two directly portable transparent baselines via `berka-real-data-v1`; retain the stronger three-month mean as the real-data reference winner on Berka rather than assuming run rate is superior.
- [ ] Add warning thresholds only after backtested forecast error is understood from representative modern user/real-world evidence.
- [ ] Add category-level spending forecasts after the overall baseline contract is stable on representative data.
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
- [x] Pin the current stable Expo/React Native/React dependency set through the Expo toolchain and add Expo Router.
- [x] Add versioned SQLite migrations, foreign keys and WAL mode.
- [x] Add local repositories for transactions, categories and budgets behind a platform-neutral repository boundary.
- [x] Add durable `sync_outbox`, `sync_state` and `sync_conflicts` persistence.
- [x] Add secure device credential storage and define the SQLCipher/native encrypted-database production path.
- [x] Add mobile unit/type/lint/build validation to CI.

### Phase 5C - Backend synchronization and mobile authentication

- [x] Add server-owned sync versions for syncable entities.
- [x] Add authenticated sync device/mutation/change-journal persistence with Alembic migrations.
- [x] Add idempotent bounded `POST /api/v2/sync/push`.
- [x] Add cursor-based bounded `GET /api/v2/sync/pull` with delete tombstones and no gaps/duplicates.
- [x] Add a consistent paginated bootstrap path and typed `sync_cursor_expired` recovery.
- [x] Add a mobile-appropriate short-lived access/refresh credential flow while preserving the existing HttpOnly browser-cookie flow.
- [x] Reuse current session-version/password-change/account-deletion revocation semantics for mobile credentials.
- [x] Regression-test cross-account isolation, stale conflicts, retries, concurrent web/mobile writes and exact Decimal money.

### Phase 5D - Offline transaction vertical slice

- [x] Add Android authentication/session bootstrap.
- [x] Add local-first transaction list/detail/form flows.
- [x] Support offline transaction create/edit/delete with client-generated UUIDs.
- [x] Implement foreground push/pull synchronization with bounded retry/backoff.
- [x] Preserve the durable outbox across app/process termination.
- [x] Surface pending/failed/conflict state explicitly in the UI.
- [x] Add explicit conflict resolution instead of silent last-write-wins.
- [x] Add one combined browser + native-device E2E proving web-create -> Android-pull and Android-offline-create -> server -> web in a single cross-client scenario, including durable process restart and host-side PostgreSQL absence/presence verification.

### Phase 5E - Categories and budgets

- [x] Replicate system/account-owned categories while preserving server ownership and archive/reassign rules.
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
- [x] Cache selected latest server-derived responses only as read-only mobile UX state where appropriate.

### Phase 5G - Android production hardening

- [x] Add production local-database encryption and verify logout/account-deletion local data wipe.
- [x] Add background synchronization only after foreground sync correctness is proven.
- [x] Add account-switch/device-isolation tests.
- [x] Add mobile security/privacy review and ensure no backend/provider secrets are shipped in the application.
- [x] Add Android development/release build pipeline, signing strategy and distributable AAB artifact.
- [x] Add Android offline/reconnect/conflict E2E coverage to the required quality gate.
- [x] Keep the architecture portable to a future iOS client without making iOS a Phase 5 release blocker.

### Phase 5H - Native Android emulator E2E gate

- [x] Migrate a real plaintext legacy Expo-SQLite fixture to SQLCipher and verify plaintext removal/header encryption on-device.
- [x] Prove durable offline transaction persistence across Android process death and foreground reconnect synchronization.
- [x] Produce and resolve a real `stale_version` conflict after an independent server-side version advance.
- [x] Force the registered WorkManager/JobScheduler job while backgrounded and prove the pending mutation reaches FastAPI/PostgreSQL.
- [x] Prove native account-switch isolation with an empty second-account workspace and no residual outbox/conflict state.
- [x] Gate the invariant set in GitHub Actions with pinned Maestro/emulator tooling and failure diagnostics.

## Phase 6 - Premium SaaS Preparation

Goal: prepare the project for a subscription-based model.

- [x] Define versioned free and premium limits under `premium-entitlements-v1` without enforcing quotas prematurely.
- [x] Add server-owned premium feature flags that distinguish plan eligibility from release-time enablement.
- [x] Add a provider-neutral subscription-ready user model and include subscription state in privacy export.
- [x] Complete payment-provider/store research and document the provider-independent billing architecture in `docs/payment-provider-decision.md`.
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
- [x] Gate `berka-real-data-v1` parser/provenance/causal-cutoff/report-privacy behavior with synthetic temporary relations while keeping the 1.05M-row raw public dataset outside CI/repository storage.
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