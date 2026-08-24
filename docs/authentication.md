# Authentication and data ownership

Smart Expense AI uses server-managed authentication and per-user transaction ownership through the versioned `/api/v1` contract.

## Session model

Registration and login issue a signed JWT through an HttpOnly cookie. The frontend never reads or stores the token directly.

Default development properties:

- cookie name: `smart_expense_session`;
- `HttpOnly`: enabled;
- `SameSite`: `Lax`;
- `Secure`: configurable through `AUTH_COOKIE_SECURE` for local HTTP development;
- access-token lifetime: 60 minutes by default.

Staging and production refuse to start unless `AUTH_COOKIE_SECURE=true`. Production also refuses `APP_DEBUG=true`.

`JWT_SECRET` is mandatory and must contain at least 32 bytes. Development examples contain non-production placeholders; staging and production must inject a long random secret through the deployment secret store.

JWT validation is restricted to HS256 and requires:

```text
sub
issued-at (iat)
expiration (exp)
issuer (iss)
audience (aud)
unique token id (jti)
```

## Password storage and authentication behavior

Passwords are hashed with the recommended Argon2 configuration provided by `pwdlib`. Plaintext passwords are accepted only in registration/login request bodies and are never persisted or returned.

New passwords must contain at least 12 characters. Login failure messages do not distinguish an unknown account from an incorrect password. Unknown accounts still execute a dummy Argon2 verification to reduce timing differences. Duplicate registration also returns a generic error and performs password hashing before account-existence rejection.

## Rate limiting

The Docker/production-style path assumes FastAPI is behind Nginx. Nginx applies per-source-IP request limits to the versioned authentication entry points:

```text
POST /api/v1/auth/login     5 requests/minute, burst 4
POST /api/v1/auth/register  3 requests/minute, burst 2
```

The configured burst allows the initial requests immediately; excess requests receive HTTP `429`.

This control lives at the trusted edge rather than in per-process Python memory, so deploying FastAPI behind a different gateway requires an equivalent distributed/edge limiter.

## Cross-site request defense

State-changing `/api/*` requests are rejected when the browser provides an untrusted `Origin` or declares `Sec-Fetch-Site: cross-site`. The expected browser origin is configured by `FRONTEND_ORIGIN`.

This complements `SameSite=Lax`; it should be revisited if the frontend/backend move to different sites or third-party clients need cross-origin mutation access.

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

## Error semantics

Authentication errors use the same API v1 envelope as the rest of the application:

```json
{
  "error": {
    "code": "http_401",
    "message": "Invalid email or password",
    "requestId": "..."
  }
}
```

The request ID can be correlated with safe security logs without exposing credentials. See `docs/api.md` for the complete error and versioning contract.

## Existing pre-authentication data

Migration `0003_users_and_transaction_ownership` preserves transactions created before accounts existed. It assigns them temporarily to an inactive legacy migration owner. When the first active account is registered, that history is transferred to the new user and the temporary owner is removed.

This migration behavior is intended for the existing single-user development/MVP database. It avoids silently deleting prior financial data while establishing a mandatory non-null ownership constraint.

## Security logging

Authentication/security events record an event name, outcome, generated request ID, and an internal user UUID only after authentication when useful.

The application deliberately does not log:

- passwords;
- email addresses;
- request bodies;
- JWTs or session cookies;
- database URLs/secrets;
- financial transaction payloads.

The container disables Uvicorn access logging and uses the Nginx edge access log, configured with method + `$uri` + status + request ID. `$uri` excludes query strings.

## Endpoints

Public:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /health
```

Authenticated:

```text
GET    /api/v1/auth/me
GET    /api/v1/categories
GET    /api/v1/transactions
POST   /api/v1/transactions
PUT    /api/v1/transactions/{transaction_id}
DELETE /api/v1/transactions/{transaction_id}
GET    /api/v1/analytics/summary
GET    /api/v1/analytics/monthly-expenses
```

Unversioned application routes such as `/api/auth/login` and `/api/transactions` are not supported contract aliases.

## Tests

Backend integration tests create multiple accounts and prove cross-account list/update/delete isolation. They also cover API v1 versioning, normalized errors, security headers, cookie flags, trusted-host rejection, cross-site mutation rejection, and generic authentication failures.

The Playwright critical flow repeats ownership isolation in a real browser session. Docker CI verifies the reverse-proxy headers, versioned API contract and rate limiter.

## Remaining production controls

The current MVP still needs:

- password reset/change;
- account deletion and privacy export;
- production TLS termination/domain configuration;
- centralized security log collection and alerting;
- token revocation/secret rotation if the production threat model requires it;
- MFA if the application becomes Internet-facing with real financial data.

See `docs/SECURITY_REVIEW.md` for the OWASP Top 10:2025 review and `SECURITY.md` for vulnerability reporting.
