# Testing and CI

Smart Expense AI uses layered automated verification for persistence, authentication, security controls, versioned API contracts, monetary precision, deterministic financial intelligence, historical analysis, category suggestions/personalization, ML evaluation, privacy-safe private-evaluation tooling, responsive UX, supply-chain inventory and critical browser flows.

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

## Category suggestion/product contract

Backend integration coverage verifies:

- authenticated `POST /api/v2/category-suggestions/preview`;
- global `tfidf-logreg-v1` suggestion behavior over merchant text;
- preview responses contain category/source/model/feature provenance but no `confidence` or probability vector;
- requesting a suggestion does not mutate transaction data;
- a user's prior correction for a canonical merchant takes precedence over the global classifier only for that user;
- account-owned categories can be learned through that user's feedback without entering the global model taxonomy;
- historical choices are ignored if no longer active/visible/type-compatible;
- two users do not share personalization history;
- v2 transaction + suggestion feedback persistence is atomic;
- privacy export includes only the authenticated user's `categorySuggestions` records;
- account deletion cascades category-suggestion feedback.

Frontend component coverage verifies that displaying a suggestion leaves the existing category unchanged until `Accept` is clicked. Accessible selector assertions are scoped to the transaction form rather than relying on ambiguous `.first()` selectors.

Playwright covers the full correction loop:

```text
MERCADONA 3921
  -> global Food suggestion
  -> Change to user category
  -> save transaction/feedback
Mercadona 9999
  -> personalized user-history suggestion
  -> form still unchanged
  -> Accept
```

## Analysis contract / documentation consistency

`backend/tests/unit/test_analysis_contracts.py` verifies current implementation aliases:

```text
rules-v2
historical-v2.2
merchant_mad_plus_extreme_iqr_v1
lifecycle-v1
tfidf-logreg-v1
merchant_descriptor_only_v1
```

It also reads primary technical documents and rejects known stale policy claims.

## Labelled chronological financial evaluation

The financial/historical harness uses chronological monthly folds rather than random time-series splitting.

```bash
cd backend
python scripts/evaluate_historical.py evaluation/historical_v2_fixture.json
```

`financial-benchmark-v1` additionally verifies generated hashes/labels, calibration/validation discipline, sealed holdout behavior, recurrence/anomaly scenarios, fold-local identity, deterministic matching, prospective occurrence metrics, lifecycle diagnostics and protected amount-anomaly behavior.

Evidence hierarchy:

```text
small fixture -> regression protection
financial-benchmark-v1 -> synthetic development evidence
private-real-data-v1 harness -> private/independent evaluation mechanism
independent / real labelled results -> real quality evidence
```

The existence of the private harness is not itself real-world validation.

## Category classifier benchmark

Model contract:

```text
model = tfidf-logreg-v1
featurePolicy = merchant_descriptor_only_v1
report = category-classifier-evaluation-v2
```

The dedicated workflow:

- regenerates all 2,560 complete synthetic category labels;
- preserves chronological 2023 -> 2024 -> 2025 H1 evaluation and the sealed 2025 H2 holdout;
- reports macro-F1, accuracy, weighted F1, per-category metrics and confusion matrices;
- reports seen-vs-unseen exact merchant slices;
- performs a canonical merchant-group-disjoint cold-start benchmark with zero group overlap;
- measures raw, Platt and isotonic probabilities with multiclass Brier score, Expected Calibration Error and ten reliability bins;
- asserts `productConfidenceEnabled=false`;
- runs deterministic model/protocol unit tests.

Measured synthetic cold-start evidence:

```text
evaluationSamples        382
evaluationMerchantGroups 9
merchantGroupOverlap     0
accuracy                 0.400524
macroF1                  0.201242
weightedF1               0.254513
```

Measured synthetic calibration diagnostics:

| Method | Brier | ECE |
| --- | ---: | ---: |
| Raw | 0.018193 | 0.082021 |
| Platt | 0.008871 | 0.004624 |
| Isotonic | 0.009156 | 0.004711 |

These diagnostics prove neither real-world accuracy nor real-world calibration. Product confidence remains disabled until representative real labelled data supports it.

## Private real-data evaluator — `private-real-data-v1`

`backend/tests/unit/test_private_evaluation.py` creates its dataset entirely under pytest's temporary directory. No private file, bank export or real merchant history is present in the repository or required by CI.

The regression exercises the same command path intended for local real-data evaluation and verifies:

- `manifest.json` requires ordered, non-overlapping calibration/validation/holdout month ranges;
- category labels have complete one-to-one transaction coverage;
- anomaly labels have complete one-to-one expense-transaction coverage;
- the production runtime classifier is evaluated without retraining on the private dataset;
- natural seen/unseen merchant support is computed relative to the immutable runtime bootstrap corpus;
- development mode compares raw/Platt/isotonic calibration on validation while keeping holdout sealed;
- holdout mode requires previously frozen `historical-v2.2` parameters and one preselected category calibration method;
- `rules-v2` amount/frequency anomaly metrics use only historical context through the scored split boundary;
- `historical-v2.2` reuses the established walk-forward/bootstrap runner rather than a second private-only algorithm;
- aggregate reports omit merchant strings, transaction IDs, row-level errors and merchant-specific historical slices.

Local private run from `backend/`:

```bash
python scripts/evaluate_private_dataset.py \
  ../data/private \
  --mode development \
  --parameters-output ../data/private/historical-parameters.json \
  --output ../data/private/development-report.json
```

See [`private-evaluation.md`](private-evaluation.md) for the schema, holdout procedure and privacy boundary.

## PostgreSQL integration

PowerShell example:

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

Backend integration coverage includes v1 compatibility, v2 decimal money, pagination/filtering, categories/budgets/imports, category suggestions/feedback, intelligence, historical snapshots, authentication/session rotation, privacy export isolation and account deletion.

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
- category suggestion correction + personalized reuse.

Algorithm depth remains tested at service/integration/evaluation layers rather than duplicating every semantic through the browser.

## Docker Compose smoke test

The deployment-style job verifies Nginx/browser security headers, API no-store behavior, authentication, exact money, current historical-analysis contracts, normalized errors, rate limiting, internal-only services and startup of the production backend image.

The backend image includes `backend/ml` and installs `scikit-learn` from runtime requirements because category suggestions are served by FastAPI in production Compose.

## Dependency security and SBOM

The blocking security audit runs `pip-audit` and `npm audit --audit-level=high`.

`.github/workflows/sbom.yml` independently reconstructs backend/frontend runtime dependencies, generates/validates CycloneDX 1.6 JSON inventories and uploads the `dependency-sboms` artifact. Container/OS image scanning remains a separate roadmap item.

## GitHub Actions gates

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main`.

Functional gates:

- **Backend tests** — clean PostgreSQL migration, FastAPI import, pytest, protected evaluation checks and the synthetic private-evaluator privacy regression.
- **Frontend quality** — Vitest -> TypeScript -> ESLint -> production build.
- **Dependency security audit** — Python and npm audits.
- **Critical E2E** — PostgreSQL/FastAPI/Vite/Chromium flows.
- **Docker Compose smoke test** — deployment-style image/proxy/API contract.
- **Quality gate** — fails unless every functional gate succeeds.

Additional merge-candidate workflows:

- **Financial benchmark**;
- **Lifecycle diagnostic**;
- **Category classifier benchmark** — chronological + merchant-group cold-start + calibration evidence + sealed holdout;
- **Supply chain SBOM**.

Third-party Actions are pinned to immutable commit SHAs. Dependabot monitors Actions, pip and npm dependencies.
