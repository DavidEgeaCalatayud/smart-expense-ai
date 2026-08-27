All notable changes to Smart Expense AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project has not yet declared a stable semantic-version release, so existing repository history is not retroactively presented as fabricated releases. Git history and merged pull requests remain the authoritative record for work completed before changelog adoption.

## [Unreleased]

### Added

- `spending-forecast-v1`, an authenticated overall month-end expense forecast contract with previous-three-complete-month mean, current-month run-rate and recurrence-aware baselines using exact Decimal money.
- `GET /api/v2/analytics/spending-forecast` with optional reproducible `asOf`, explicit assumptions/evidence, historical comparison and per-baseline walk-forward MAE, sMAPE and signed bias.
- Causal fixed day-15 walk-forward forecasting evaluation that admits a month only when all baselines are available, guaranteeing identical chronological fold support.
- Recurrence-aware forecast composition that removes qualified recurring transactions already observed from the variable run-rate numerator and adds only future `recurring-calendar-v1` occurrences, preventing double counting.
- Protected **Predictions** month-end forecast cards showing the three deterministic estimates, assumptions, historical comparison and historical error evidence without presenting probability/confidence.
- Reproducible `spending-forecast-benchmark-v1` evaluator and dedicated **Spending forecast benchmark** GitHub Actions workflow enforcing cutoff, common support, metric completeness and ML-promotion-gate semantics.
- Backend unit/integration, frontend component and persisted Playwright regression coverage for `spending-forecast-v1`.
- `docs/spending-forecast.md` as the source of truth for forecast formulas, causal boundaries, walk-forward evaluation, benchmark semantics and the future ML promotion gate.
- `recurring-calendar-v1`, an authenticated API/product projection that converts existing `historical-v2.2` / `lifecycle-v1` recurrence evidence into upcoming recurring charges without introducing another prediction model.
- Protected **Predictions** recurring-payment calendar with exact next-30-days future total, month-grouped charges, deterministic `expected` / `likely` / `price_changed` states and a separate overdue-schedule section.
- `GET /api/v2/intelligence/upcoming-payments` with a bounded 1–90 day window, optional reproducible `asOf` date, decimal-string amounts and explicit recurrence/lifecycle/price evidence for every item.
- Backend regressions for month-end schedule preservation, overdue/dormant safety and latest-price-regime projection, plus component and persisted Playwright coverage for recurring-history -> calendar behavior.
- `docs/upcoming-payments.md` documenting `recurring-calendar-v1`, projection states, exact-money behavior, dormancy safety and the API/UI contract.
- Privacy-safe `private-real-data-v1` dataset contract for independently labelled local transactions under git-ignored `data/private/`, with explicit calibration/validation/holdout ranges and complete category/anomaly label-coverage requirements.
- Aggregate-only private evaluator for the deployed `tfidf-logreg-v1` runtime classifier, natural seen-vs-unseen merchant support, out-of-taxonomy support and raw/Platt/isotonic calibration diagnostics without retraining the production model on evaluation data.
- Aggregate transaction-level private evaluation of `rules-v2` spending/frequency anomalies with precision, recall, F1 and false positives per 100 transactions, plus reuse of the existing `historical-v2.2` walk-forward/holdout/bootstrap machinery.
- SHA-256 private-dataset fingerprints and sanitized reports that omit raw transactions, merchant strings, transaction IDs, row-level classifier errors and merchant-specific historical slices.
- Synthetic temporary-data regressions that exercise development and holdout private-evaluation paths in normal backend CI without requiring or accessing private financial data.
- `docs/private-evaluation.md` and tracked `data/private/README.md` documenting the local schema, privacy boundary, holdout discipline and reproducible CLI workflow.
- User-controlled AI category suggestions in the transaction workflow using `tfidf-logreg-v1`, with explicit **Accept** / **Change** controls and no automatic category mutation.
- Persisted `category_suggestions` feedback capturing user, transaction, canonical merchant, suggestion provenance, model/feature contract, suggested category, selected category and acceptance/correction timestamps.
- Per-user canonical-merchant personalization that reuses an account's latest compatible category choice before falling back to the global classifier, including account-owned custom categories without adding them to the global model taxonomy.
- Canonical merchant-group cold-start evaluation with zero train/evaluation merchant-group overlap, plus Brier score, Expected Calibration Error and reliability-bin diagnostics comparing raw, Platt-scaled and isotonic probabilities on separate development splits while keeping the final holdout sealed.
- Explicit privacy/account-lifecycle regressions proving `categorySuggestions` is exported only for the owning account and removed by account deletion.
- Backend, component and Playwright regression coverage for explicit suggestion acceptance/correction, personalized reuse and cross-account isolation.
- Account-owned custom categories with case-insensitive conflict protection, explicit transaction type, archive/reassign/restore lifecycle and system-category coexistence.
- Authenticated monthly budgets for overall spending and individual expense categories, persisted with decimal monetary contracts and server-calculated progress.
- Protected Categories and Budgets frontend workspaces plus component and Playwright regression coverage for category creation and monthly category budgets.
- Privacy export coverage for custom categories and budgets so newly persisted account-owned planning data remains portable and isolated.
- Central analysis/model contract registry in `backend/app/analysis_contracts.py` for current engine versions and named strategy identifiers.
- Documentation consistency coverage that prevents current analysis contracts from silently drifting away from implementation.
- MIT license granting explicit reuse, modification and distribution rights.
- `docs/analysis-contracts.md` as the human-readable index for current analysis/model versions, policy ownership and change procedure.
- Revocable authenticated sessions through a persisted user `session_version` claim.
- Account self-service for password changes, authenticated `privacy-export-v1` downloads and confirmed account deletion.
- Security-page controls for password rotation, privacy export and account deletion.
- PostgreSQL regression coverage proving privacy-export isolation across transactions, findings, scans and historical-analysis snapshots for separate users.
- A focused Playwright Security flow covering password rotation, current-session continuity, logout, rejection of the old password and login with the new password.
- Responsive mobile/tablet transaction cards that preserve the same transaction metadata and Edit/Delete behavior as the desktop table.
- Component regression coverage for responsive transaction cards, the desktop table, recurring indicators, accessible actions and the single empty state.
- Reproducible, validated CycloneDX 1.6 backend/frontend dependency SBOM generation in GitHub Actions, retained as the `dependency-sboms` artifact.
- `docs/supply-chain.md` documenting dependency-audit/SBOM scope and the remaining container-image scanning boundary.
- Authenticated CSV transaction import with delimiter/header detection, reviewed column mapping, explicit date/decimal/sign normalization, preview, validation and atomic persistence.
- Persisted `import_batches` audit records plus transaction import lineage and per-user SHA-256 duplicate fingerprints.
- Database-enforced imported-transaction deduplication, including safe re-import, within-file duplicates and comparison against existing manually entered account history.
- Guided **Import CSV** frontend workspace with mapping controls, valid/duplicate/invalid preview, commit feedback and batch history.
- PostgreSQL and Playwright regression coverage for CSV import atomicity, account isolation, duplicate-only re-import and privacy/account-deletion lifecycle.
- `docs/csv-import.md` as the source of truth for the CSV contract, supported normalization rules, EUR-only boundary, fingerprint semantics and import limits.
- This changelog.

### Changed

- `recurring-calendar-v1` can separate its historical evidence cutoff from a later projection-window start; normal product behavior remains unchanged while `spending-forecast-v1` uses the boundary to avoid future leakage and same-day double counting.
- Recurring profiles expose the latest observed stream amount in addition to the median so downstream price-continuity projections can represent the current sequential price regime without changing historical recurrence scoring.
- Missing/overdue recurring schedules are not automatically rolled into future expected totals; new observed activity must re-establish the stream before future projection resumes.
- The roadmap now marks recurring calendar plus deterministic month-end baselines/backtesting as implemented while keeping category forecasts, warning thresholds and forecasting ML challengers future work.
- Forecasting ML has an explicit promotion gate: Ridge/Random Forest/Gradient Boosting or other approaches must consistently beat transparent baselines on identical causal walk-forward folds/support before entering the product.
- Future anomaly ML is explicitly a challenger to `rules-v2`; an `IsolationForest-v1` path must use causal/prior-only features and be compared on the same labelled evidence rather than automatically replacing the deterministic engine.
- API v2 transaction creation/update computes suggestion provenance server-side and persists the transaction plus category-feedback record atomically; clients cannot supply or spoof model version, feature policy or suggested category metadata.
- `scikit-learn` is a runtime backend dependency and `backend/ml` is packaged in the backend Docker image because FastAPI serves the category suggestion baseline.
- `privacy-export-v1` includes account-owned category-suggestion feedback in addition to CSV import batches, custom categories and budgets; account deletion removes the same feedback through database ownership cascades.
- Category-classifier evaluation is `category-classifier-evaluation-v2`, adding a 382-row / nine-group canonical merchant cold-start slice with zero group overlap and raw/Platt/isotonic calibration diagnostics while retaining the sealed 2025 H2 holdout.
- The model card, README, architecture, API, product, testing and roadmap documentation describe current suggestion, recurring-calendar and deterministic forecast behavior rather than stale placeholders.
- Category lookup adds authenticated user-aware resolution alongside legacy category contracts, preserving existing `list_categories()` / `_get_category()` behavior and legacy unknown-vs-incompatible error semantics.
- Transaction creation, update and CSV import can resolve active system categories together with the authenticated user's active custom categories.
- Historical-analysis documentation treats `historical-v2.2` as the current persisted diagnostic engine and `lifecycle-v1` as the current recurrence segmentation contract.
- Actionable, historical and API amount-anomaly documentation reflects the shared `merchant_mad_plus_extreme_iqr_v1` merchant-only baseline.
- Current strategy identifiers are consumed from the central registry by their owning implementations.
- The FastAPI application version is centralized in `backend/app/version.py`; the application and CI import smoke check consume the same `APP_VERSION`.
- The transaction list switches at the desktop breakpoint from cards to the existing dense table without changing server-side filters, pagination or mutation handlers.
- Production-readiness tracking distinguishes completed application dependency SBOM generation from pending container image scanning/image-level SBOM work.
- README and roadmap present CSV historical import as implemented while keeping direct bank APIs and multi-currency/FX accounting future work.

### Fixed

- Asynchronous category loading no longer rebuilds and clears merchant/amount/date/type/payment/recurring input that a user started entering before `fetchCategories()` completed; only a blank or incompatible category is initialized/repaired.
- Critical category-suggestion and recurring-calendar Playwright flows now wait on semantic form readiness/successful reset rather than incidental timing or transaction-table row counts.

### Removed

- Obsolete Predictions placeholder/state that treated recurring-payment projection or deterministic overall month-end baseline forecasting as unimplemented; Predictions now contains both `recurring-calendar-v1` and `spending-forecast-v1` while forecasting ML remains future work.
- Obsolete documentation that described `tfidf-logreg-v1` as offline-only or unavailable to the production Compose/API runtime.
- Obsolete documentation claiming that `rules-v2` or `historical-v2.2` falls back to category history when merchant history is insufficient for amount-anomaly detection.
- Obsolete wording that presented `historical-v2.1` as the current historical engine.
- Proposed `Merchant`, `RecurringExpense`, `Alert` and `Insight` persistence models from the current-data-model document; those concepts are not standalone current tables.

## Release policy

When the project deliberately reaches a stable release boundary, create a semantic version tag and GitHub Release from the corresponding `main` commit, then move the applicable entries out of `Unreleased` into a dated version section. Do not create retrospective version tags merely to make old development history look released.
