# Authentication and data ownership

Smart Expense AI uses server-managed authentication and per-user transaction ownership.

## Session model

Registration and login issue a signed JWT through an HttpOnly cookie. The frontend never reads or stores the token directly.

Default development properties:

- cookie name: `smart_expense_session`;
- `HttpOnly`: enabled;
- `SameSite`: `Lax`;
- `Secure`: configurable through `AUTH_COOKIE_SECURE` and disabled only for local HTTP development;
- access-token lifetime: 60 minutes by default.

`JWT_SECRET` is mandatory. Development examples contain non-production placeholders; staging and production must inject a long random secret through the deployment secret store.

## Password storage

Passwords are hashed with the recommended Argon2 configuration provided by `pwdlib`. Plaintext passwords are accepted only in registration/login request bodies and are never persisted or returned.

## Authorization boundary

Transactions contain a non-null `user_id` foreign key. The service layer always includes the authenticated user ID in transaction queries:

```text
request cookie
    -> authenticated User
    -> service(db, user.id, ...)
    -> WHERE transactions.user_id = user.id
```

Update and delete operations query by both transaction ID and user ID. A transaction owned by another account therefore returns the same `404 Transaction not found` response as an unknown UUID.

Seeded categories remain global read-only reference data for now, but reading them requires an authenticated session. If custom user categories are introduced later, ownership will be added at that point.

## Existing pre-authentication data

Migration `0003_users_and_transaction_ownership` preserves transactions created before accounts existed. It assigns them temporarily to an inactive legacy migration owner. When the first active account is registered, that history is transferred to the new user and the temporary owner is removed.

This migration behavior is intended for the existing single-user development/MVP database. It avoids silently deleting prior financial data while establishing a mandatory non-null ownership constraint.

## Endpoints

Public:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /health
```

Authenticated:

```text
GET    /api/auth/me
GET    /api/categories
GET    /api/transactions
POST   /api/transactions
PUT    /api/transactions/{transaction_id}
DELETE /api/transactions/{transaction_id}
```

## Tests

Backend integration tests create multiple accounts and prove cross-account list/update/delete isolation. The Playwright critical flow repeats the isolation check in a real browser session. Docker CI registers a test user before checking protected proxied endpoints.

## Remaining production controls

The current MVP still needs password reset/change, account deletion, privacy export, deployment-level secure cookies/HTTPS, rate limiting and a dedicated security review before public production use.
