# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- Manual **Mi dinero / Net worth** workspace across web and Android for tracking balances held in banks, brokers, wallets, cash and other manually maintained accounts without external bank connections.
- Purpose-aware financial accounts (`daily`, `savings`, `emergency_fund`, `opportunities`, `investment`, `other`) with current net-worth summaries for available, reserved and invested money.
- Immutable `FinancialAccountBalanceSnapshot` history and net-worth evolution endpoints/visualization.
- Android offline-first financial-account editing in the SQLCipher-backed local database, including local account creation, metadata edits, balance changes, archive operations, conflict handling and sync status.
- `sync-v1` replication for financial accounts and server-authored balance snapshots, with bootstrap reconstruction of current balances plus history on a new device.
- Read-only Financial Assistant `get_net_worth_summary` tool grounded in server-computed manual balances.
- Privacy export coverage for manual financial accounts and their balance history.

### Changed

- Mobile encrypted database schema advanced to v3 for financial-account and balance-snapshot replicas.
- Sync journal entity types now include `financial_account` and `financial_account_snapshot`; journal type storage is widened to support the snapshot entity name.

### Security / correctness

- Financial account mutations remain scoped to the authenticated user; mobile clients cannot directly mutate replicated balance-snapshot rows.
- Financial account deletion through sync is rejected in favor of archival so historical balance evidence is preserved.
- Mobile financial arithmetic remains integer-minor-unit based; API/server persistence keeps decimal-string → `Decimal` → PostgreSQL `NUMERIC(12,2)` semantics.

---

The repository history before this entry remains available in Git. This changelog section records the currently unreleased Mi dinero expansion.
