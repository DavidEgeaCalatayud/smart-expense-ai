# Privacy and data handling

> **Status:** technical pre-production draft. This document describes the current application behavior and is not a substitute for a jurisdiction-specific privacy notice. Before an Internet-facing production launch, the operator must complete the controller/contact/legal-basis/retention fields and obtain the appropriate legal review.

## 1. Scope

Smart Expense AI stores personal-finance data for authenticated users so it can provide transaction management, analytics, deterministic financial-intelligence findings and historical analysis.

The current implementation is designed around per-user ownership. Authenticated financial records are scoped by the server-side user identifier; a user must not be able to retrieve, modify, export or delete another user's records.

## 2. Data processed by the application

The application currently persists:

- account identifier, email address and display name;
- an Argon2 password hash (never the plaintext password);
- a numeric session-version counter used to revoke previously issued JWT sessions;
- transactions, including merchant, description, category, exact decimal amount, currency, date, payment method, recurrence flag and source;
- financial-intelligence findings and scan metadata;
- historical-analysis snapshots and their generated result payloads;
- operational/security logs needed to diagnose requests and security-relevant events.

The application does **not** intentionally persist the user's plaintext password or browser session token in the database.

## 3. Authentication and session data

The browser session is represented by a signed JWT stored in an `HttpOnly`, `SameSite=Lax` cookie. The token is not stored in browser local storage.

Each token contains a session version. The server compares that value with the current account record on every authenticated request. A password change increments the account session version, which invalidates previously issued tokens even if their cryptographic expiry time has not yet been reached.

## 4. Privacy export

Authenticated users can request `GET /api/v1/auth/privacy-export` or use the Security page to download a `privacy-export-v1` JSON document.

The export contains the authenticated user's:

- account identity fields;
- transactions;
- financial-intelligence findings;
- intelligence scan metadata;
- historical-analysis snapshots.

The export deliberately excludes password hashes, session-version internals and JWT/session tokens. Export queries are scoped by the authenticated user ID.

Because privacy exports contain financial information, users should store downloaded export files securely and delete them when no longer required.

## 5. Account deletion

Authenticated users can permanently delete their account from the Security page or through `DELETE /api/v1/auth/account`.

Deletion requires:

1. the current password;
2. the exact confirmation value `DELETE`;
3. a final confirmation in the user interface.

The user row is deleted transactionally. Database foreign keys use cascade deletion for user-owned transactions, financial-intelligence findings, scan records and historical-analysis snapshots. The authentication cookie is cleared after successful deletion.

This operation is intentionally irreversible at the application layer.

## 6. Security controls relevant to privacy

Current controls include:

- Argon2 password hashing;
- signed JWT cookies marked `HttpOnly` and `SameSite=Lax`;
- server-side session-version revocation;
- per-user ownership filters on financial endpoints;
- cross-site mutation checks and trusted-host validation;
- normalized API errors without returning internal exception details;
- dependency vulnerability auditing in CI;
- security-event logging that must not include passwords, tokens or financial export payloads.

See [`authentication.md`](authentication.md) and [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) for the technical security model.

## 7. Retention and backups

The application-layer deletion behavior is implemented, but a production privacy policy must separately define retention for infrastructure logs, database backups and disaster-recovery copies.

Before production, define:

- **Application data retention:** `[TO DEFINE]`
- **Security/operational log retention:** `[TO DEFINE]`
- **Backup retention and deletion propagation:** `[TO DEFINE]`
- **Legal or fraud-prevention retention exceptions:** `[TO DEFINE, IF APPLICABLE]`

Do not claim immediate erasure from backups unless the deployed backup architecture actually guarantees it.

## 8. External processors and international transfers

The repository does not determine which cloud host, email provider, monitoring platform, analytics service or other processor a production operator will choose.

Before production, document:

- **Hosting provider and region:** `[TO DEFINE]`
- **Monitoring/logging provider:** `[TO DEFINE]`
- **Email/recovery provider:** `[TO DEFINE BEFORE PASSWORD RESET IS ENABLED]`
- **Other processors:** `[TO DEFINE]`
- **Transfer safeguards where applicable:** `[TO DEFINE]`

## 9. Cookies

The current authentication cookie is required for signed-in functionality. The application does not need to describe optional analytics/advertising cookies until such services actually exist and are enabled.

If optional tracking is introduced later, this document and the product consent behavior must be updated before deployment.

## 10. User requests and contact

Self-service controls currently cover password change, privacy export and account deletion.

Before production, provide a channel for privacy requests that cannot be completed through self-service controls:

- **Data controller/operator:** `[TO DEFINE]`
- **Privacy contact:** `[TO DEFINE]`
- **Postal address (if required):** `[TO DEFINE]`
- **Effective date:** `[TO DEFINE AT PRODUCTION RELEASE]`

Password reset by email is intentionally not represented as implemented until a verified recovery-token delivery mechanism exists.
