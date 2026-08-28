# Testing and CI

Smart Expense AI uses layered automated verification for persistence, authentication, security controls, versioned API contracts, exact monetary arithmetic, deterministic financial intelligence, historical analysis, recurring-payment projection, month-end forecasting, anomaly challengers, category suggestions/personalization, Financial Assistant orchestration/evidence grounding, ML evaluation, privacy-safe private-evaluation tooling, public real-world evidence, responsive UX, supply-chain inventory and critical browser flows.

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

## Offline anomaly challenger — `isolation-forest-v1`

`backend/tests/unit/test_isolation_forest_anomaly.py` protects the offline challenger contract:

- feature rows are chronological and use only prior merchant/global state;
- appending future extreme transactions leaves earlier feature rows unchanged;
- fit, calibration and evaluation windows must be disjoint and ordered;
- the forest is fitted only on the pre-calibration range;
- calibration labels select a frozen score threshold without refitting the forest;
- later evaluation uses identical labelled support for `rules-v2`, `isolation-forest-v1` and `rules-v2-or-isolation-forest-v1`;
- each system reports precision, recall, F1, false positives per 100 and history-depth slices;
- reports explicitly keep `finalHoldoutUsedForFit=false` and `replaceProductionRules=false`;
- appending rows after the evaluation window cannot alter an existing aggregate report.

### Dedicated anomaly challenger benchmark

From `backend/`:

```bash
python scripts/evaluate_anomaly_challenger.py --output /tmp/anomaly-challenger.json
```

`.github/workflows/anomaly-challenger.yml` executes the same controlled fixture on every PR targeting `main` and every push to `main`. It verifies `anomaly-challenger-benchmark-v1`, `isolation-forest-v1`, `causal-transaction-features-v1`, the explicit union hybrid, common support, metric completeness, future-row invariance and the non-promotion guard.

The gate does **not** require the ML model to beat `rules-v2` on synthetic data. Complexity is not an acceptance criterion, and the fixture is not a real-world accuracy or fraud-detection claim. See [`isolation-forest-challenger.md`](isolation-forest-challenger.md).

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

## Financial Assistant v1

Financial Assistant tests treat the LLM as an untrusted orchestration/explanation component. The purpose of coverage is not to grade prose quality; it is to prove that facts, scope and evidence remain backend-controlled.

Backend unit coverage verifies:

- all six function schemas are strict and expose no `userId`, `user_id` or equivalent identity argument;
- runtime tool execution rejects provider-supplied identity keys even if a provider violates the declared schema;
- tool rounds/calls are bounded;
- model-selected evidence is resolved only against evidence records emitted by tools executed in the current request;
- invented evidence references are filtered and produce an explicit limitation;
- when tools ran but the final model output supplies no valid evidence, canonical executed evidence is surfaced with a limitation instead of returning an unsupported answer;
- fake providers can exercise the complete orchestration flow without network calls or an OpenAI key.

Backend PostgreSQL integration coverage verifies:

- `POST /api/v2/assistant/query` requires authentication;
- no configured provider returns typed `503 financial_assistant_not_configured` without breaking the rest of FastAPI;
- a period comparison is scoped exclusively by the authenticated user's account even when a second account contains conflicting/high-value transactions;
- period totals, absolute difference, percentage difference and category changes are backend-computed with `Decimal`;
- the provider sees bounded evidence JSON, not a selectable user identifier.

The provider integration boundary is intentionally fakeable. CI does not call OpenAI and does not require a real `OPENAI_API_KEY`; external model availability is not a prerequisite for deterministic application verification.

Frontend component coverage verifies one stateless question, structured answer rendering, canonical evidence display, limitations and request ID.

Critical Playwright coverage registers an authenticated user, opens **Assistant**, submits a question and inspects the actual browser POST body. The regression asserts that the body is exactly:

```json
{
  "question": "Why did I spend more this month?"
}
```

No user identity or chat-history field is sent by the web client.

See [`financial-assistant.md`](financial-assistant.md).

## Analysis contract / documentation consistency

`backend/tests/unit/test_analysis_contracts.py` verifies current implementation aliases and primary documentation for:

```text
rules-v2
historical-v2.2
recurring-calendar-v1
spending-forecast-v1
berka-real-data-v1
merchant_mad_plus_extreme_iqr_v1
isolation-forest-v1
causal-transaction-features-v1
rules-v2-or-isolation-forest-v1
lifecycle-v1
tfidf-logreg-v1
merchant_descriptor_only_v1
```

It also rejects known stale policy claims, including documentation that would describe the implemented recurring calendar, deterministic forecast baselines or offline anomaly challenger as future work. Financial Assistant v1 is an orchestration/product contract rather than a new analytical-model alias, so its dedicated tests/docs protect its provider/tool/evidence invariants separately.

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
anomaly-challenger-benchmark-v1 -> causal rules-vs-ML regression evidence
berka-real-data-v1 -> public observed historical banking evidence
private-real-data-v1 harness -> private/independent evaluation mechanism
modern independent / private labelled results -> strongest product-specific evidence
```

## Category classifier benchmark

The dedicated workflow protects `tfidf-logreg-v1` and `merchant_descriptor_only_v1`, including chronological synthetic evaluation, a sealed holdout, canonical merchant-group-disjoint cold start, raw/Platt/isotonic Brier/ECE diagnostics and `productConfidenceEnabled=false`.

Current synthetic cold-start evidence includes 382 evaluation samples across nine held-out merchant groups with zero group overlap, accuracy `0.400524` and macro-F1 `0.201242`. These diagnostics are not real-world accuracy claims.

## Private real-data evaluator — `private-real-data-v1`

`backend/tests/unit/test_private_evaluation.py` constructs its dataset entirely under pytest temporary storage. CI never requires real financial files.

Regression coverage verifies ordered non-overlapping calibration/validation/holdout ranges, complete label coverage, fixed production classifier evaluation without retraining on the private set, natural seen/unseen support, calibration selection discipline, prior-only `rules-v2` context, reuse of `historical-v2.2`, SHA-256 dataset fingerprints and aggregate-only sanitization.

The `isolation-forest-v1` challenger is compatible with this split/label discipline but remains a separate aggregate-only evaluator in this cycle; CI does not consume private financial rows.

See [`private-evaluation.md`](private-evaluation.md).

## Public real-world evaluator — `berka-real-data-v1`

`berka-real-data-v1` consumes the original PKDD'99 Berka `account.asc`, `order.asc` and `trans.asc` relations and marks provenance as:

```text
real_public_historical
```

The raw 1.05M-row dataset is not committed and is not required by CI. The committed `docs/evidence/berka-real-data-v1.json` contains aggregate support/metrics plus SHA-256 fingerprints only.

Reproduce locally from `backend/`:

```bash
python scripts/evaluate_berka_real_data.py /path/to/berka-dataset-master.zip \
  --output /tmp/berka-real-data-v1.json
```

`backend/tests/unit/test_berka_real_data_evaluation.py` uses tiny temporary relations to protect:

- `real_public_historical` provenance and the `berka-real-data-v1` registry alias;
- fixed day-15 forecast causality, including a later same-month expense that may affect the outcome but never the prediction;
- per-account evaluation ending at the final observed transaction month rather than inventing zero-spend months after observation ends;
- aggregate-only report sanitization and source fingerprints;
- safe ZIP ingestion that copies only the three expected relations and never writes unrelated/path-traversal members;
- rejection of ambiguous ZIPs containing duplicate relation basenames;
- committed real-report coverage anchors (1,056,320 transactions and 171,826 forecast account-month folds).

The observed report is evidence for the transparent previous-three-month and day-15 run-rate formulas plus the regularity of linked permanent bank orders. It deliberately does **not** claim modern merchant-classifier quality, suggestion acceptance/correction, subjective anomaly usefulness or a production `historical-v2.2` recurrence score. See [`REAL_WORLD_EVIDENCE.md`](REAL_WORLD_EVIDENCE.md).

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

Integration coverage includes v1 compatibility, v2 decimal money, pagination/filtering, categories/budgets/imports, category suggestions/feedback, intelligence, historical snapshots, authenticated upcoming-payment projection, authenticated `spending-forecast-v1`, Financial Assistant authentication/account isolation/provider-unavailable behavior, session rotation, privacy export isolation and account deletion.

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
- persisted historical spending -> `spending-forecast-v1` month-end forecast with common day-15 backtest evidence;
- protected Financial Assistant question -> structured answer/evidence rendering with a request body containing only `question`.

The assistant E2E stubs the external provider-facing API response at the HTTP boundary so CI verifies browser/application semantics without sending financial data to an external model. Backend fake-provider tests separately verify tool orchestration and grounding.

The IsolationForest challenger and Berka evaluator are offline-only, so neither intentionally has a browser/product E2E path. Algorithm/evidence depth remains tested at unit/evaluation layers.

## Docker Compose smoke test

The deployment-style job verifies Nginx/browser security headers, API no-store behavior, authentication, exact money, current historical-analysis contracts, normalized errors, rate limiting, internal-only services and startup of the production backend image.

Compose intentionally starts successfully with no `OPENAI_API_KEY`. Assistant configuration is optional and forwarded only into the backend container, preserving an operational non-assistant product when no LLM provider is configured.

## Dependency security and SBOM

The blocking security audit runs `pip-audit` and `npm audit --audit-level=high`. The OpenAI SDK is therefore included in the normal Python runtime audit whenever the Financial Assistant provider adapter is present.

`.github/workflows/sbom.yml` independently reconstructs backend/frontend runtime dependencies, generates/validates CycloneDX 1.6 JSON inventories and uploads the `dependency-sboms` artifact. Container/OS image scanning remains a separate roadmap item.

## GitHub Actions gates

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main`.

Functional gates:

- **Backend tests** — clean PostgreSQL migration, FastAPI import, pytest, assistant/account-isolation/grounding regressions, Berka parser/privacy/causality regressions, analysis-contract/documentation checks and protected evaluation fixtures.
- **Frontend quality** — Vitest -> TypeScript -> ESLint -> production build.
- **Dependency security audit** — Python and npm audits.
- **Critical E2E** — PostgreSQL/FastAPI/Vite/Chromium flows including recurring calendar, spending forecast and Financial Assistant UI/request contract.
- **Docker Compose smoke test** — deployment-style image/proxy/API/configuration contract.
- **Quality gate** — fails unless every functional gate succeeds.

Additional merge-candidate workflows:

- **Financial benchmark**;
- **Lifecycle diagnostic**;
- **Category classifier benchmark**;
- **Spending forecast benchmark**;
- **Anomaly challenger benchmark**;
- **Supply chain SBOM**.

The real Berka source is intentionally not downloaded by Actions. CI protects the evaluator contract with synthetic temporary relations; the committed aggregate report is reproducible locally only when source fingerprints match.

Third-party Actions are pinned to immutable commit SHAs. Dependabot monitors Actions, pip and npm dependencies.