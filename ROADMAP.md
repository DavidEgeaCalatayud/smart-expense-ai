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

## Phase 1 - Persistent MVP Core

Goal: make the first usable version persist real financial data.

- [x] Define transaction and category models.
- [x] Add PostgreSQL persistence with SQLAlchemy 2.
- [x] Add Alembic migrations.
- [x] Seed initial categories.
- [x] Create transaction CRUD endpoints.
- [x] Connect Transactions page to the REST API.
- [x] Load categories from the backend.
- [x] Validate category/type compatibility.
- [x] Remove transaction/category frontend mocks.
- [x] Build dashboard metrics from persisted transactions.
- [x] Build six-month expense chart from persisted transactions.
- [x] Show recent persisted transactions.
- [x] Add transparent rule-based review for high-value expenses.
- [x] Add server-side transaction pagination.
- [x] Add server-side search, category, status, type, recurring, date and sort filters.
- [x] Add aggregate summary and monthly-expense endpoints.
- [x] Add normalized API errors with semantic codes and request IDs.
- [x] Add typed frontend API errors for validation, authentication, authorization, conflicts, server and network failures.
- [x] Preserve safe backend error messages, request IDs and validation details in frontend UX.
- [x] Version the supported application API under `/api/v1`.
- [x] Add backward-compatible `/api/v2` financial endpoints with decimal-string monetary contracts.
- [x] Keep money as PostgreSQL `NUMERIC` / Python `Decimal` through financial services and rules.
- [x] Use decimal strings plus integer cents in the frontend instead of floating-point money arithmetic.
- [ ] Improve responsive transaction UX.
- [x] Add delete confirmation and operation feedback.
- [x] Add distinct loading, refreshing, retry and mutation states in transaction UX.
- [ ] Add user-managed category CRUD when needed.

## Phase 2 - Accounts and Data Ownership

Goal: isolate financial data by user before adding sensitive integrations.

- [x] User registration.
- [x] User login and logout.
- [x] Signed JWT session stored in an HttpOnly cookie.
- [x] Argon2 password hashing.
- [x] Add mandatory user ownership to transactions.
- [x] Scope transaction list/update/delete operations by authenticated user ID.
- [x] Require authentication for financial/category API reads.
- [x] Keep seeded categories global and read-only until custom category CRUD is introduced.
- [x] Add authenticated session visibility in the Security page.
- [x] Cover cross-account transaction isolation in integration and E2E tests.
- [x] Harden authentication errors, password policy and JWT claim validation.
- [x] Add trusted-host, origin and CORS protections.
- [x] Add authentication rate limiting at the trusted edge.
- [ ] Password change and password reset flow.
- [ ] Account deletion and privacy export controls.
- [ ] MFA if required for Internet-facing production use.

## Phase 3 - Financial Intelligence

Goal: implement real analysis without simulated AI outputs.

- [x] Detect recurring transactions from historical data.
- [x] Detect possible duplicated subscriptions from repeated near-duplicate billing patterns.
- [x] Detect abnormal transaction amounts against merchant-specific historical baselines.
- [x] Add persisted intelligence findings, scan history and review workflow.
- [x] Add finding severity levels.
- [x] Generate explainable evidence for every finding.
- [x] Make rescans idempotent through stable per-user fingerprints.
- [x] Keep intelligence findings isolated by authenticated user ownership.
- [x] Add Financial Intelligence frontend workspace for scan/review/dismiss/resolve/reopen flows.
- [x] Remove floating-point money calculations from the intelligence rules and evidence pipeline.
- [x] Add versioned persisted historical-analysis snapshots (`historical-v1`).
- [x] Add least-squares monthly spending trend analysis with slope and R² evidence.
- [x] Add deterministic recurring-behavior scoring from cadence fit, interval regularity, amount stability and history depth.
- [x] Add chronological robust outlier analysis that avoids future-data leakage.
- [x] Add category fallback baselines when merchant history is insufficient for historical outlier analysis.
- [x] Add three-month vs three-month category-spend shift analysis.
- [x] Add Historical Analysis UI with coverage, trend, recurrence scores, outliers and category shifts.
- [x] Persist and isolate historical-analysis snapshots by authenticated user.
- [x] Add `historical-v2` month-completeness handling that excludes partial cutoff months from trend and category-shift calculations without forecasting them.
- [x] Add auditable merchant canonicalization with raw descriptor preservation, reference/legal-token cleanup, explicit aliases and conservative fuzzy clustering.
- [x] Make recurrence calendar-aware with day-of-month/month-end/day-of-week stability, amount MAD/CV, consecutive periods and missed expected occurrences.
- [x] Detect overdue expected recurring payments from learned calendar schedules.
- [x] Add a labelled evaluation dataset format and monthly walk-forward validation harness (no random time-series split).
- [x] Report precision, recall, F1, false positives per 100 transactions, false negatives and performance slices by history length/merchant/category.
- [x] Run the historical-v2 evaluation fixture in CI as a reproducibility gate.
- [x] Add `historical-v2.1` with fold-local merchant identity so evaluation never canonicalizes using future descriptors.
- [x] Make recurrence ground truth temporal with active ranges and/or explicit expected occurrences instead of global merchant labels.
- [x] Segment canonical merchants into multiple descriptor/amount recurring streams so subscriptions and ad-hoc charges are not collapsed together.
- [x] Expose stream keys/descriptors and recurring-stream segmentation evidence through API/UI while keeping older snapshots readable.
- [x] Add regressions for future-identity leakage, cancellation/reactivation labels and multi-stream merchants such as Apple.
- [x] Add `historical-v2.2` temporal-phase clustering for equal-merchant/equal-amount streams with no descriptor evidence.
- [x] Require repeated concurrent calendar evidence before splitting monthly/weekly phases, preventing billing-day drift from becoming a false second stream.
- [x] Expose stream basis/calendar signatures and temporal-phase coverage in persisted snapshots and API responses.
- [x] Extend temporal ground-truth labels with `calendarSignature` and evaluate v2.2 in the fold-local walk-forward harness.
- [x] Add positive and negative regressions for equal-amount monthly/weekly streams and non-concurrent billing-day drift.
- [x] Replace order-dependent recurring-label matching with deterministic optimal bipartite assignment and permutation-invariance regressions.
- [x] Add prospective occurrence-level evaluation using only the prior-month baseline for each expected charge.
- [x] Measure occurrence precision/recall/F1, missed charges, extra predictions, date MAE/bias and decimal amount MAE/MAPE.
- [x] Support explicit `{date, amount}` expected-occurrence ground truth while keeping date-only labels backward-compatible.
- [x] Keep unlabelled occurrence months out of occurrence false-positive metrics unless the dataset explicitly declares complete coverage.
- [ ] Validate rules and historical algorithms against labelled real-world datasets and measure real-world precision/recall/false-positive rates.
- [ ] Tune recurring-score weights/cutoffs, stream-clustering tolerances and anomaly thresholds only from labelled evaluation evidence.
- [ ] Add automatic/background analysis when deployment scheduling is available.
- [ ] Promote category fallback/canonicalization into persisted findings only where real-world validation shows value.
- [ ] Evaluate ML anomaly models (for example Isolation Forest) only after deterministic baselines have measurable real-world evaluation results.

## Phase 4 - Prediction

Goal: estimate future spending and provide proactive warnings.

- [ ] Predict end-of-month spending.
- [ ] Predict recurring charges.
- [ ] Compare predicted spending with historical averages.
- [ ] Add warning thresholds.
- [ ] Add category-level spending forecasts.
- [ ] Expose prediction evidence and assumptions.
- [ ] Add model evaluation before displaying confidence metrics.

## Phase 5 - Premium SaaS Preparation

Goal: prepare the project for a subscription-based model.

- [ ] Define free and premium limits.
- [ ] Add premium feature flags.
- [ ] Add subscription-ready user model.
- [ ] Add payment provider research.
- [ ] Add exportable reports.
- [ ] Add advanced insights.

## Phase 6 - Production Readiness

Goal: prepare the application for real deployment.

- [x] Add backend automated tests.
- [x] Add frontend automated tests.
- [x] Add GitHub Actions CI.
- [x] Run frontend tests, type checking, build and lint in CI.
- [x] Validate Alembic migrations against PostgreSQL in CI.
- [x] Add critical Playwright end-to-end coverage.
- [x] Add Docker Compose.
- [x] Validate the full Docker Compose stack in CI.
- [x] Add `SECURITY.md` vulnerability reporting policy.
- [x] Add Dependabot for pip, npm and GitHub Actions.
- [x] Add Python and npm dependency vulnerability audits to the Quality gate.
- [x] Pin GitHub Actions to immutable commit SHAs.
- [x] Add HTTP security headers and reduced sensitive logging.
- [x] Complete a baseline OWASP Top 10:2025 review.
- [x] Add API v1 contract documentation and CI smoke coverage.
- [x] Add API v2 decimal-money contract tests and Docker smoke coverage.
- [x] Validate historical-analysis API through backend/Docker CI.
- [x] Run the labelled historical evaluation command in CI.
- [x] Gate historical-v2.1 fold-local identity and temporal stream-label evaluation in CI.
- [x] Gate historical-v2.2 equal-amount temporal-phase clustering and calendar-signature evaluation in CI.
- [x] Gate optimal recurring matching and prospective occurrence-level evaluation in backend CI.
- [ ] Configure `Quality gate` as a required check for `main`.
- [ ] Add staging deployment.
- [ ] Add production TLS/domain/secrets configuration.
- [ ] Add centralized security monitoring and alerting.
- [ ] Add container image scanning and SBOM generation.
- [ ] Add privacy policy draft.

## Long-Term Ideas

- Bank account integration.
- Email receipt analysis.
- Mobile application.
- AI chat assistant for financial questions.
- Multi-currency support.
- Shared household accounts.
- Budget recommendations.
- Goal-based saving plans.
