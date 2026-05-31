# Contributing

This project is currently in an early private development stage.

## Development Principles

- Keep the codebase simple and maintainable.
- Prioritize clear architecture over premature complexity.
- Do not add artificial intelligence features before the basic financial model is stable.
- Treat financial data as sensitive by default.
- Prefer explicit business logic over hidden behavior.

## Suggested Workflow

1. Create a branch from `main`.
2. Implement a small, focused change.
3. Add or update documentation when needed.
4. Open a pull request.
5. Review the change before merging.

## Branch Naming

Suggested format:

```txt
feature/short-description
fix/short-description
docs/short-description
chore/short-description
```

Examples:

```txt
feature/transaction-crud
docs/update-architecture
fix/category-validation
```

## Commit Style

Use clear commit messages.

Examples:

```txt
Add transaction data model
Create initial dashboard layout
Document anomaly detection strategy
Fix category validation error
```

## Code Quality

Before merging, the project should eventually run:

- Linting.
- Formatting.
- Unit tests.
- Type checks where applicable.

## Security

Do not commit:

- `.env` files.
- API keys.
- Database credentials.
- Personal financial data.
- Real bank exports.

Use anonymized sample data for tests and demos.
