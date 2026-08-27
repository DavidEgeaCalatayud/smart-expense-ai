All notable changes to Smart Expense AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project has not yet declared a stable semantic-version release, so existing repository history is not retroactively presented as fabricated releases. Git history and merged pull requests remain the authoritative record for work completed before changelog adoption.

## [Unreleased]

### Added

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

- API v2 transaction creation/update now computes suggestion provenance server-side and persists the transaction plus category-feedback record atomically; clients cannot supply or spoof model version, feature policy or suggested category metadata.
- `scikit-learn` is now a runtime backend dependency and `backend/ml` is packaged in the backend Docker image because FastAPI serves the category suggestion baseline.
- `privacy-export-v1` now includes account-owned category-suggestion feedback in addition to CSV import batches, custom categories and budgets; account deletion removes the same feedback through database ownership cascades.
- Category-classifier evaluation is now `category-classifier-evaluation-v2`, adding a 382-row / nine-group canonical merchant cold-start slice with zero group overlap and raw/Platt/isotonic calibration diagnostics while retaining the sealed 2025 H2 holdout.
- The model card, README, architecture, API, data-model, testing and roadmap documentation now describe the implemented suggestion/feedback runtime rather than an offline-only classifier.
- Category lookup adds authenticated user-aware resolution alongside the legacy category contracts, preserving existing `list_categories()` / `_get_category()` behavior and legacy unknown-vs-incompatible error semantics.
- Transaction creation, update and CSV import can resolve active system categories together with the authenticated user's active custom categories.
- `privacy-export-v1` includes account-owned custom categories and budgets in addition to CSV import-batch metadata.
- Historical-analysis documentation treats `historical-v2.2` as the current persisted diagnostic engine and `lifecycle-v1` as the current recurrence segmentation contract.
- Actionable, historical and API amount-anomaly documentation reflects the shared `merchant_mad_plus_extreme_iqr_v1` merchant-only baseline.
- Current strategy identifiers are consumed from the central registry by their owning implementations.
- The FastAPI application version is centralized in `backend/app/version.py`; the application and CI import smoke check consume the same `APP_VERSION`.
- The transaction list switches at the desktop breakpoint from cards to the existing dense table without changing server-side filters, pagination or mutation handlers.
- Production-readiness tracking distinguishes completed application dependency SBOM generation from pending container image scanning/image-level SBOM work.
- README and roadmap present CSV historical import as implemented while keeping direct bank APIs and multi-currency/FX accounting future work.

### Removed

- Obsolete documentation that described `tfidf-logreg-v1` as offline-only or unavailable to the production Compose/API runtime.
- Obsolete documentation claiming that `rules-v2` or `historical-v2.2` falls back to category history when merchant history is insufficient for amount-anomaly detection.
- Obsolete wording that presented `historical-v2.1` as the current historical engine.
- Proposed `Merchant`, `RecurringExpense`, `Alert` and `Insight` persistence models from the current-data-model document; those concepts are not standalone current tables.

## Release policy

When the project deliberately reaches a stable release boundary, create a semantic version tag and GitHub Release from the corresponding `main` commit, then move the applicable entries out of `Unreleased` into a dated version section. Do not create retrospective version tags merely to make old development history look released.
