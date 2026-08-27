# Testing and CI

Smart Expense AI uses layered automated verification for persistence, authentication, security controls, versioned API contracts, exact monetary arithmetic, deterministic financial intelligence, historical analysis, recurring-payment projection, month-end forecasting, category suggestions/personalization, ML evaluation, privacy-safe private-evaluation tooling, responsive UX, supply-chain inventory and critical browser flows.

Current analytical identifiers come from `backend/app/analysis_contracts.py`; see [`analysis-contracts.md`](analysis-contracts.md). Tests explicitly prevent key implementation/documentation contracts from silently drifting.

## Backend

From `backend/`:

```bash
pip install -r requirements.txt -r requirements-dev.txt
pytest -m "not integration"
pytest
```

Integration tests run against PostgreSQL rather than SQLite. Financial logic uses `Decimal`; money is never validated through binary floating-point business arithmetic.

## Actionable findings — `rules-v2`

Coverage includes canonical merchant identity, multi-stream recurrence, calendar/lifecycle evidence, missing recurring payments, duplicate subscriptions, `merchant_mad_plus_extreme_iqr_v1`, prior-only amount baselines, frequency anomalies, idempotent fingerprints, review states and decimal-string evidence.

## Historical analysis — `historical-v2.2`

Tests cover month completeness, fold-local merchant identity, recurrence calendars/lifecycle, temporal stream segmentation, price continuity, cancellation/reactivation, missed occurrences, prior-only merchant amount outliers, category shifts, snapshot versioning and compatibility. The current recurrence segmentation contract is `lifecycle-v1`.

## Upcoming recurring payments — `recurring-calendar-v1`

Backend regressions verify month-end schedule preservation, bounded weekly/biweekly expansion, exact future-only totals, overdue/dormant safety, latest-price-regime projection and deterministic evidence labels.

The projection primitive is additionally tested with a projection `window_start` later than its historical `asOf` cutoff. This is the causal boundary reused by `spending-forecast-v1`: recurrence evidence stays frozen at the forecast date while only subsequent occurrences enter the forecast.

Frontend component coverage keeps future totals separate from overdue schedules. Playwright persists real recurring history and verifies the generated calendar through the PostgreSQL-backed product path.

## Month-end spending forecast — `spending-forecast-v1`

Backend unit coverage verifies:

- transactions after `asOf` cannot influence any estimate;
- previous-three-complete-month mean uses complete months only and exact Decimal arithmetic;
- current-month run rate uses elapsed calendar days;
- a qualified recurring charge already observed in the current month is not double counted;
- only future qualified `recurring-calendar-v1` occurrences are added through month end;
- recurring identity comes from `historical-v2.2` / `lifecycle-v1`, not a manually asserted recurring flag;
- all backtest baselines use the same fixed day-15 chronological folds/support;
- MAE, sMAPE and signed bias are present when support exists;
- insufficient history remains explicitly unavailable.

PostgreSQL integration coverage verifies authenticated/user-scoped `GET /api/v2/analytics/spending-forecast` and its decimal-string/versioned contract.

Frontend component coverage verifies all three baseline cards, assumptions, historical comparison and MAE/sMAPE/bias presentation. Critical Playwright coverage creates persisted historical spending, opens **Predictions** and verifies `spending-forecast-v1` plus the three baseline/backtest views.

### Dedicated forecast benchmark

From `backend/`:

```bash
python scripts/evaluate_spending_forecast.py --output /tmp/spending-forecast.json
```

`.github/workflows/spending-forecast.yml` runs the same deterministic fixture on every PR targeting `main` and every push to `main`. The gate verifies:

- `spending-forecast-benchmark-v1` / `spending-forecast-v1` identifiers;
- fixed day-15 cutoff;
- identical support for `three_month_mean`, `run_rate` and `recurrence_aware`;
- complete MAE/sMAPE/bias metrics;
- exact three-month mean on stationary spend;
- recurrence-aware improvement over raw run rate when a qualified future recurring charge is known;
- explicit same-fold ML promotion-gate metadata.

The fixture protects implementation semantics; it is not a real-world forecast-accuracy claim.

## Category suggestion/product contract

Backend integration coverage verifies authenticated preview, global `tfidf-logreg-v1`, absence of confidence/probability in product responses, per-user canonical-merchant personalization, account-owned category reuse, cross-account isolation, atomic transaction+feedback persistence and privacy/account lifecycle behavior.

Frontend component and Playwright coverage verify that displaying a suggestion does not mutate the selected category until explicit Accept/Change and that corrections can become per-user merchant-history suggestions.

## Analysis contract / documentation consistency

`backend/tests/unit/test_analysis_contracts.py` verifies current implementation aliases and primary documentation for:

```text
rules-v2
historical-v2.2
recurring-calendar-v1
spending-forecast-v1
merchant_mad_plus_extreme_iqr_v1
lifecycle-v1
tfidf-logreg-v1
merchant_descriptor_only_v1
```

It also rejects known stale policy claims, including documentation that would describe the implemented recurring calendar or deterministic forecast baselines as future work.

## Labelled chronological financial evaluation

The historical harness uses chronological monthly folds rather than random time-series splitting.

```bash
cd backend
python scripts/evaluate_historical.py evaluation/historical_v2_fixture.json
```

`financial-benchmark-v1` verifies generated hashes/labels, calibration/validation discipline, sealed holdout behavior, recurrence/anomaly scenarios, fold-local identity, deterministic matching, prospective occurrence metrics, lifecycle diagnostics and protected amount-anomaly behavior.

Evidence hierarchy:

```text
small fixture -> regression protection
financial-benchmark-v1 -> synthetic development evidence
spending-forecast-benchmark-v1 -> deterministic forecast regression evidence
private-real-data-v1 harness -> private/independent evaluation mechanism
independent / real labelled results -> real quality evidence
```

## Category classifier benchmark

The dedicated workflow protects `tfidf-logreg-v1` and `merchant_descriptor_only_v1`, including chronological synthetic evaluation, a sealed holdout, canonical merchant-group-disjoint cold start, raw/Platt/isotonic Brier/ECE diagnostics and `productConfidenceEnabled=false`.

Current synthetic cold-start evidence includes 382 evaluation samples across nine held-out merchant groups with zero group overlap, accuracy `0.400524` and macro-F1 `0.201242`. These diagnostics are not real-world accuracy claims.

## Private real-data evaluator — `private-real-data-v1`

`backend/tests/unit/test_private_evaluation.py` constructs its dataset entirely under pytest temporary storage. CI never requires real financial files.

Regression coverage verifies ordered non-overlapping calibration/validation/holdout ranges, complete label coverage, fixed production classifier evaluation without retraining on the private set, natural seen/unseen support, calibration selection discipline, prior-only `rules-v2` context, reuse of `historical-v2.2`, SHA-256 dataset fingerprints and aggregate-only sanitization.

See [`private-evaluation.md`](private-evaluation.md).

## PostgreSQL integration

PowerShell:

```powershell
$env:TEST_DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/smart_expense_ai_test"
$env:DATABASE_URL=$env:TEST_DATABASE_URL
alembic upgrade head
pytest
```

Bash:

```bash
export TEST_DATABASE_URL="postgresql+psycopg://postgres:postgres@localhost:5432/smart_expense_ai_test"
export DATABASE_URL="$TEST_DATABASE_URL"
alembic upgrade head
pytest
```

Integration coverage includes v1 compatibility, v2 decimal money, pagination/filtering, categories/budgets/imports, category suggestions/feedback, intelligence, historical snapshots, authenticated upcoming-payment projection, authenticated `spending-forecast-v1`, session rotation, privacy export isolation and account deletion.

## Frontend quality chain

Use locked dependencies and run the complete chain in order:

```bash
cd frontend
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
npm audit --audit-level=high
```

Passing Vitest alone is not considered a green frontend. CI requires component tests, TypeScript, ESLint and the production build.

## End-to-end

Playwright exercises critical authenticated flows against PostgreSQL/FastAPI/Vite/Chromium, including:

- transaction CRUD and cross-account isolation;
- custom category + budget flow;
- CSV import/re-import safety;
- password/session rotation;
- category suggestion correction + personalized reuse;
- persisted recurring history -> `recurring-calendar-v1` projection;
- persisted historical spending -> `spending-forecast-v1` month-end forecast with common day-15 backtest evidence.

Algorithm depth remains tested at service/integration/evaluation layers rather than duplicating every semantic through the browser.

## Docker Compose smoke test

The deployment-style job verifies Nginx/browser security headers, API no-store behavior, authentication, exact money, current historical-analysis contracts, normalized errors, rate limiting, internal-only services and startup of the production backend image.

## Dependency security and SBOM

The blocking security audit runs `pip-audit` and `npm audit --audit-level=high`.

`.github/workflows/sbom.yml` independently reconstructs backend/frontend runtime dependencies, generates/validates CycloneDX 1.6 JSON inventories and uploads the `dependency-sboms` artifact. Container/OS image scanning remains a separate roadmap item.

## GitHub Actions gates

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main`.

Functional gates:

- **Backend tests** — clean PostgreSQL migration, FastAPI import, pytest, analysis-contract/documentation checks and protected evaluation fixtures.
- **Frontend quality** — Vitest -> TypeScript -> ESLint -> production build.
- **Dependency security audit** — Python and npm audits.
- **Critical E2E** — PostgreSQL/FastAPI/Vite/Chromium flows including recurring calendar and spending forecast.
- **Docker Compose smoke test** — deployment-style image/proxy/API contract.
- **Quality gate** — fails unless every functional gate succeeds.

Additional merge-candidate workflows:

- **Financial benchmark**;
- **Lifecycle diagnostic**;
- **Category classifier benchmark**;
- **Spending forecast benchmark**;
- **Supply chain SBOM**.

Third-party Actions are pinned to immutable commit SHAs. Dependabot monitors Actions, pip and npm dependencies.
