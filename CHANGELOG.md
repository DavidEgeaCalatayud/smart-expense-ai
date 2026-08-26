# Changelog

All notable changes to Smart Expense AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project has not yet declared a stable semantic-version release, so existing repository history is not retroactively presented as fabricated releases. Git history and merged pull requests remain the authoritative record for work completed before changelog adoption.

## [Unreleased]

### Added

- Central analysis/model contract registry in `backend/app/analysis_contracts.py` for current engine versions and named strategy identifiers.
- Documentation consistency coverage that prevents current analysis contracts from silently drifting away from implementation.
- MIT license granting explicit reuse, modification and distribution rights.
- `docs/analysis-contracts.md` as the human-readable index for current analysis/model versions, policy ownership and change procedure.
- This changelog.

### Changed

- `README.md`, `ROADMAP.md`, API, testing and engine documentation now share the same current analytical identifiers.
- Historical-analysis documentation now treats `historical-v2.2` as the current persisted diagnostic engine and `lifecycle-v1` as the current recurrence segmentation contract.
- Actionable, historical and API amount-anomaly documentation now reflects the shared `merchant_mad_plus_extreme_iqr_v1` merchant-only baseline introduced by PR #42.
- Architecture documentation now describes the implemented React/FastAPI/PostgreSQL/`rules-v2`/`historical-v2.2`/offline-ML system instead of the original proposed MVP architecture.
- Data-model documentation now describes the actual persisted `users`, `categories`, `transactions`, `intelligence_findings`, `intelligence_scans` and `historical_analysis_snapshots` schema rather than speculative future entities.
- Product documentation now distinguishes implemented behavior from future roadmap capabilities such as forecasting, bank integrations and production automatic categorization.
- Current strategy identifiers are consumed from the central registry by their owning implementations.

### Removed

- Obsolete documentation claiming that `rules-v2` or `historical-v2.2` falls back to category history when merchant history is insufficient for amount-anomaly detection.
- Obsolete wording that presented `historical-v2.1` as the current historical engine.
- Proposed `Merchant`, `RecurringExpense`, `Alert` and `Insight` persistence models from the current-data-model document; those concepts are not standalone current tables.

## Release policy

When the project deliberately reaches a stable release boundary, create a semantic version tag and GitHub Release from the corresponding `main` commit, then move the applicable entries out of `Unreleased` into a dated version section. Do not create retrospective version tags merely to make old development history look released.
