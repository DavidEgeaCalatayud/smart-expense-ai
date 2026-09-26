# Smart Expense AI

Smart Expense AI is a privacy-focused personal finance workspace for tracking transactions, budgets, net worth, reports, forecasts, explainable financial intelligence, and grounded assistant workflows across web and Android.

The project is intentionally self-hostable and keeps user-scoped financial data behind authenticated FastAPI APIs. Web and Android clients share exact monetary contracts; the Android app uses a SQLCipher-backed offline-first replica and synchronization engine.

## Highlights

- Authenticated transaction management with exact decimal money contracts.
- Manual **Mi dinero / Net worth** workspace for banks, brokers, wallets and cash without connecting external institutions.
- Purpose-aware balances: day-to-day, savings, emergency fund, opportunities, investments and other.
- Immutable manual balance snapshots and historical net-worth evolution.
- Android offline-first net-worth editing through the encrypted local database and `sync-v1` replication.
- Budgets, CSV import, reports, forecasts, historical analysis and advanced insights.
- Explainable financial-intelligence findings with persisted evidence.
- Grounded Financial Assistant tools that read server-computed facts instead of inventing financial values.
- Account privacy export and deletion workflows.
- PostgreSQL + FastAPI backend, React web frontend and Expo/React Native Android client.

## Repository layout

```text
backend/        FastAPI, SQLAlchemy, Alembic, PostgreSQL services and tests
frontend/       React web application
mobile/         Expo / React Native Android application
shared/         Shared API and domain contracts
docs/           Product and engineering documentation
```

## Manual net worth architecture

`FinancialAccount` stores the current manually maintained balance and classification metadata. `FinancialAccountBalanceSnapshot` stores immutable historical balance observations. Updating a balance never overwrites the historical series.

The initial contract is EUR-only and deliberately avoids Open Banking credentials. Web writes use the authenticated API directly; Android writes first to encrypted SQLite and synchronize through the same server authority. The sync journal replicates both current account state and server-authored balance snapshots so a new Android installation can reconstruct historical net worth.

## Development

See the component-specific documentation under `backend/`, `frontend/`, `mobile/` and `docs/` for local setup, testing and deployment details.

## Security and privacy

Financial records are scoped to the authenticated user. Android local financial data is stored in the SQLCipher-backed database, and privacy export includes manual financial accounts and their balance history. See [SECURITY.md](SECURITY.md) for the security model and reporting guidance.

## License

See [LICENSE](LICENSE).
