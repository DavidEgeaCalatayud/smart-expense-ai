# Security review - OWASP Top 10:2025

Review date: **2026-08-24**  
Last implementation update: **2026-08-26**

Scope: current React + Nginx + FastAPI + PostgreSQL application and its GitHub Actions supply chain.

This document is a lightweight secure-code/configuration review. It is **not** a penetration test, formal threat model, compliance assessment, or certification. The OWASP Top 10 is an awareness baseline, so passing this checklist does not prove that the application is free from vulnerabilities.

Primary reference: <https://owasp.org/Top10/>

## Summary

| OWASP Top 10:2025 category | Current controls | Residual risk / next step |
| --- | --- | --- |
| A01 Broken Access Control | Protected API routes; financial queries include authenticated `user_id`; foreign key ownership; cross-account integration + E2E tests; foreign resources return 404; privacy export independently scopes each data family by user | Future user-owned categories/files must repeat the same ownership pattern; add explicit authorization tests whenever a new resource type appears |
| A02 Security Misconfiguration | Trusted host allow-list; restricted CORS; security headers; production API docs disabled; backend not published by Compose; container `no-new-privileges`; production config invariants | Production TLS terminator/domain configuration is deployment-specific; verify HSTS and TLS externally after deployment |
| A03 Software Supply Chain Failures | npm lockfile + `npm ci`; pinned GitHub Action SHAs; weekly Dependabot for pip/npm/actions; `pip-audit`; `npm audit`; reproducible validated CycloneDX backend/frontend dependency SBOMs retained as CI artifacts | Add container-image vulnerability scanning and image-level SBOM/provenance before a public production release |
| A04 Cryptographic Failures | Argon2 password hashing; JWT HS256 with mandatory 32-byte minimum secret; issuer/audience/jti/expiry/session-version validation; HttpOnly session cookie; password changes revoke old session versions | Normal logout clears the browser cookie but does not revoke a previously copied JWT; add per-session revocation/log-out-all semantics if the production threat model requires them |
| A05 Injection | SQLAlchemy ORM/parameterized statements for user-controlled database access; Pydantic validation; React output escaping; CSP blocks arbitrary scripts | Continue avoiding dynamic SQL, unsafe HTML rendering, shell interpolation, and unvalidated file parsing when import features arrive |
| A06 Insecure Design | Per-user ownership is a server-side invariant; login/register edge rate limits; cross-site mutation guard; generic auth failures; destructive account deletion requires password + explicit confirmation; privacy export excludes credentials | Perform a fuller threat model before bank integrations, CSV/file ingestion, email-based password recovery, or external AI processing |
| A07 Authentication Failures | Argon2; 12-character password minimum; generic login/registration errors; timing equalization for unknown users; short-lived signed sessions; server-side version revocation after password changes; rate limiting | Verified password reset/recovery and MFA are not implemented; edge rate limiting must be preserved/replaced in another deployment architecture |
| A08 Software or Data Integrity Failures | Locked npm dependency graph; immutable Action SHAs; Dependabot; migration history; CI quality gate; validated dependency SBOM artifacts | Artifact signing/provenance and deployment attestations are not yet implemented |
| A09 Security Logging and Alerting Failures | Security event logs for register/login/logout/session/password-change/privacy-export/account-deletion/cross-site events; generated request IDs; logs omit email/password/body/JWT/cookie/export payloads | Logs are not centralized and there is no SIEM/alerting/retention policy; production monitoring remains required |
| A10 Mishandling of Exceptional Conditions | Database rollback on persistence failures; invalid/revoked tokens collapse to 401; unknown/foreign transactions collapse to 404; production debug disabled | Add explicit chaos/load/failure-path testing as external integrations are introduced |

## Detailed findings

### A01 - Broken Access Control

Transaction ownership remains the primary security boundary. Listing, updating, and deleting transactions require the authenticated user's UUID in the database query. Tests create two accounts and verify that one account cannot observe or mutate the other's records.

The privacy export does not aggregate globally and filter afterwards: transactions, findings, scans and historical snapshots are each selected with the authenticated user ID. Integration coverage creates a second account and proves its merchant/email do not appear in the first user's export.

**Status:** mitigated for current user-owned resources.

### A02 - Security Misconfiguration

The hardened baseline includes:

- `TrustedHostMiddleware` allow-list;
- a single configured browser origin rather than wildcard CORS;
- explicit allowed CORS methods/headers;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY` plus CSP `frame-ancestors 'none'` at Nginx;
- `Referrer-Policy: no-referrer`;
- restrictive `Permissions-Policy`;
- COOP/CORP response headers;
- `Cache-Control: no-store` on API and health responses;
- production HSTS from FastAPI when `APP_ENV=production`;
- Swagger/ReDoc/OpenAPI disabled in production;
- backend port removed from the public Compose interface;
- FastAPI container running as a non-root user.

Production refuses to start with a short JWT secret, insecure auth cookie, or debug mode.

**Residual:** HTTPS/TLS itself must be configured at the production edge. Do not enable a production deployment on plain HTTP.

### A03 / A08 - Software supply chain and integrity

Controls:

- exact `package-lock.json` + `npm ci`;
- GitHub Actions referenced by immutable commit SHA;
- weekly Dependabot checks for pip, npm, and Actions;
- Python runtime audit via `pip-audit`;
- npm dependency audit blocking high/critical findings;
- dependency checks included in the consolidated CI Quality gate;
- backend and frontend CycloneDX 1.6 dependency SBOMs generated on pull requests and pushes to `main`;
- SBOMs generated in reproducible mode, validated before upload, and retained together as the `dependency-sboms` Actions artifact;
- backend inventory generated from an isolated environment installed from `backend/requirements.txt`, and frontend inventory generated from the `npm ci` project tree represented by `frontend/package-lock.json`.

The exact SBOM coverage and limitations are documented in `docs/supply-chain.md`.

**Residual:** the current dependency SBOMs do not inventory Docker/OCI image filesystems or base-image operating-system packages. Container image vulnerability scanning, image-level SBOM/provenance, artifact signing and deployment attestations remain production-readiness work.

### A04 - Cryptographic failures

Passwords use Argon2 through `pwdlib`. Session JWTs require a minimum 32-byte secret and validate `sub`, `ver`, `iat`, `exp`, `iss`, `aud`, and `jti`. Only HS256 is accepted by configuration.

Cookies are HttpOnly and SameSite=Lax. `AUTH_COOKIE_SECURE=true` is mandatory for staging and production.

Users persist a `session_version`. Every authenticated request compares the token's `ver` claim with the current database value. Password changes increment this value and issue a fresh cookie, so all previously issued tokens are rejected immediately even if they have not expired.

**Residual:** regular logout intentionally clears only the current browser cookie. A copied token remains cryptographically valid until expiry unless the account session version is changed. If production requirements need per-device logout/revocation, introduce server-side session records or another revocation mechanism rather than overloading a single account-wide version counter.

### A05 - Injection

Current transaction/category/user queries use SQLAlchemy constructs rather than concatenated SQL. API request models constrain type, size, enum values, email format, and positive numeric amounts. The frontend does not currently render user content through unsafe raw HTML APIs.

The Nginx CSP disallows external/arbitrary script execution. Inline styles remain allowed because current UI/chart libraries depend on runtime style attributes; inline JavaScript remains disallowed.

### A06 / A07 - Insecure design and authentication

Login attempts are limited to five immediately accepted requests per source IP in the Nginx window; registration is limited more aggressively. The limiter returns HTTP 429 after the configured burst.

FastAPI also rejects browser-declared cross-site unsafe API requests when `Origin` is not the configured frontend or `Sec-Fetch-Site` is `cross-site`. This supplements SameSite cookies; it is not described as a universal CSRF solution for every future deployment architecture.

Unknown users perform a dummy Argon2 verification on login, reducing timing differences. Registration hashes the submitted password before duplicate-account rejection and returns a generic error.

Password changes require the current password and reject reuse. Account deletion requires the current password, an exact `DELETE` API confirmation and an additional frontend confirmation dialog. Database-level `ON DELETE CASCADE` relationships remove user-owned transactions, findings, scans and historical snapshots.

Email password recovery is deliberately absent until a verified token-delivery channel exists; no fake reset flow is exposed.

### A09 - Security logging and alerting

Security events currently record only:

- event category;
- outcome;
- generated request ID;
- authenticated internal user UUID when relevant.

They deliberately exclude request bodies, passwords, emails, JWTs, session cookies, database URLs, privacy-export contents and financial payloads. Nginx access logging uses `$uri` rather than the complete request URI, so query strings are not stored in the configured access log.

This follows the principle in the OWASP Logging Cheat Sheet that authentication events should be visible while session identifiers, access tokens, passwords, connection strings, keys, and sensitive personal/financial information should not be logged.

**Residual:** there is no centralized log store, immutable retention, alert routing, or incident-response automation yet.

### A10 - Mishandling of exceptional conditions

Persistence services roll back failed database transactions. Authentication failures intentionally expose safe responses. Invalid and revoked session versions collapse to the same unauthorized behavior. Production debug mode is rejected by configuration to avoid stack-trace disclosure.

Future external systems (bank APIs, file imports, AI providers, email recovery) will need explicit timeout, retry, circuit-breaking, malformed-response, and partial-failure handling reviews.

## Verification checklist

Before merging a security-sensitive change:

```text
Backend tests + migrations       PASS
Frontend tests/typecheck/lint    PASS
Production frontend build        PASS
pip-audit                        PASS
npm audit (high/critical)        PASS
CycloneDX dependency SBOMs       PASS
Authenticated E2E                PASS
Docker Compose smoke             PASS
Security headers                 PASS
Auth rate limiting               PASS
Quality gate                     PASS
```

## References

- OWASP Top 10:2025: <https://owasp.org/Top10/>
- OWASP HTTP Security Response Headers Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html>
- OWASP Authentication Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>
- OWASP Session Management Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>
- OWASP Logging Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html>
- OWASP CSRF Prevention Cheat Sheet: <https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html>
