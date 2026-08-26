# Authentication and data ownership

Smart Expense AI uses server-managed authentication and per-user financial-data ownership through the versioned `/api/v1` contract.

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
session version (ver)
issued-at (iat)
expiration (exp)
issuer (iss)
audience (aud)
unique token id (jti)
```

Each account persists a monotonically increasing `session_version`. Authentication succeeds only when the JWT `ver` claim matches the current account value. This gives the application a server-side revocation primitive without persisting individual JWTs.

Changing a password increments `session_version`, immediately invalidating previously issued tokens even if their `exp` time has not yet elapsed. The successful password-change response issues a fresh cookie containing the new version so the initiating browser can remain authenticated.

## Password storage and authentication behavior

Passwords are hashed with the recommended Argon2 configuration provided by `pwdlib`. Plaintext passwords are accepted only in sensitive authentication/account request bodies and are never persisted or returned.

New passwords must contain at least 12 characters. Login failure messages do not distinguish an unknown account from an incorrect password. Unknown accounts still execute a dummy Argon2 verification to reduce timing differences. Duplicate registration also returns a generic error and performs password hashing before account-existence rejection.

Authenticated password changes require the current password. Reusing the existing password is rejected. Password-reset-by-email is intentionally not represented as implemented because the project does not yet have a verified recovery-token delivery channel.

## Rate limiting

The Docker/production-style path assumes FastAPI is behind Nginx. Nginx applies per-source-IP request limits to the versioned authentication entry points:

```text
POST /api/v1/auth/login     5 requests/minute, burst 4
POST /api/v1/auth/register  3 requests/minute, burst 2
```

The configured burst allows the initial requests immediately; excess requests receive HTTP `429`.

This control lives at the trusted edge rather than in per-process Python memory, so deploying FastAPI behind a different gateway requires an equivalent distributed/edge limiter. A production deployment should also decide whether password-change and account-deletion endpoints need dedicated stricter edge limits based on the chosen threat model.

## Cross-site request defense

State-changing `/api/*` requests are rejected when the browser provides an untrusted `Origin` or declares `Sec-Fetch-Site: cross-site`. The expected browser origin is configured by `FRONTEND_ORIGIN`.

This complements `SameSite=Lax`; it should be revisited if the frontend/backend move to different sites or third-party clients need cross-origin mutation access.

## Authorization boundary

Transactions, intelligence findings and intelligence scan history are owned by a user through non-null `user_id` foreign keys. Services include the authenticated user ID in every financial-data query:

```text
request cookie
    -> decoded user id + session version
    -> authenticated User + version match
    -> service(db, user.id, ...)
    -> WHERE resource.user_id = user.id
```

Transaction update/delete operations query by both transaction ID and user ID. Intelligence finding review updates do the same. A transaction or finding owned by another account therefore returns the same not-found response as an unknown UUID instead of exposing that the resource exists.

The intelligence scanner first loads only expense transactions owned by the authenticated user, then persists all generated findings and scan metadata under that same user ID. No cross-account transaction is available to a user's rule evaluation.

Privacy-export queries independently scope transactions, intelligence findings, scans and historical-analysis snapshots by the authenticated user ID. The export excludes password hashes, session-version internals and JWTs.

Seeded categories remain global read-only reference data for now, but reading them requires an authenticated session. If custom user categories are introduced later, ownership will be added at that point.

## Account deletion

Account deletion is a destructive authenticated operation. The API requires both the current password and the exact confirmation value `DELETE`; the frontend adds an additional confirmation dialog.

Deleting the user is committed transactionally. User-owned transaction, intelligence-finding, intelligence-scan and historical-analysis rows reference `users.id` with database cascade deletion, so the application does not leave those financial records orphaned. The authentication cookie is cleared after successful deletion.

Infrastructure logs and backups have separate lifecycle concerns and must be covered by the production retention policy; application deletion must not be described as immediate backup erasure unless the deployed backup system actually provides that guarantee.

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

Financial-intelligence persistence is introduced later by migration `0004_financial_intelligence`; it does not create or migrate cross-user findings from legacy data. Findings are generated only when an authenticated owner runs analysis.

Migration `0007_user_session_version` adds the revocable session-version counter with a default of `1` for existing users.

## Security logging

Authentication/security events record an event name, outcome, generated request ID, and an internal user UUID only after authentication when useful.

The application deliberately does not log:

- passwords;
- email addresses;
- request bodies;
- JWTs or session cookies;
- database URLs/secrets;
- financial transaction payloads;
- privacy-export payloads;
- financial-intelligence evidence payloads.

The container disables Uvicorn access logging and uses the Nginx edge access log, configured with method + `$uri` + status + request ID. `$uri` excludes query strings.

## Endpoints

Public:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /health
```

Authenticated account controls:

```text
GET    /api/v1/auth/me
PUT    /api/v1/auth/password
GET    /api/v1/auth/privacy-export
DELETE /api/v1/auth/account
```

Authenticated financial endpoints include:

```text
GET    /api/v1/categories
GET    /api/v1/transactions
POST   /api/v1/transactions
PUT    /api/v1/transactions/{transaction_id}
DELETE /api/v1/transactions/{transaction_id}
GET    /api/v1/analytics/summary
GET    /api/v1/analytics/monthly-expenses
POST   /api/v1/intelligence/scan
GET    /api/v1/intelligence/summary
GET    /api/v1/intelligence/findings
PATCH  /api/v1/intelligence/findings/{finding_id}
```

Unversioned application routes such as `/api/auth/login` and `/api/transactions` are not supported contract aliases.

## Tests

Backend integration tests create multiple accounts and prove cross-account transaction and intelligence-finding isolation. They also cover API v1 versioning, normalized errors, security headers, cookie flags, trusted-host rejection, cross-site mutation rejection, and generic authentication failures.

Account/privacy integration coverage additionally proves that:

- an old JWT is rejected after password change;
- the initiating browser receives a fresh valid session;
- privacy exports are user-scoped and exclude credentials/session internals;
- deletion requires password + explicit confirmation;
- deletion cascades through user-owned transactions, findings, scans and historical snapshots.

The Playwright critical flow repeats transaction ownership isolation in a real browser session. Intelligence ownership is additionally covered by PostgreSQL integration tests, while Docker CI verifies authenticated/unauthenticated intelligence access through the reverse proxy.

## Remaining production controls

The current MVP still needs:

- verified email-based password reset/recovery;
- production TLS termination/domain configuration;
- centralized security log collection and alerting;
- an operator-defined backup/log retention and deletion policy;
- MFA if the application becomes Internet-facing with real financial data.

See `docs/privacy.md` for the pre-production privacy/data-handling draft, `docs/intelligence.md` for the rules-engine data flow, `docs/SECURITY_REVIEW.md` for the OWASP Top 10:2025 review and `SECURITY.md` for vulnerability reporting.