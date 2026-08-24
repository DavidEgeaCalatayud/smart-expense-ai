# Security review - OWASP Top 10:2025

Review date: **2026-08-24**

Scope: current React + Nginx + FastAPI + PostgreSQL application and its GitHub Actions supply chain.

This document is a lightweight secure-code/configuration review. It is **not** a penetration test, formal threat model, compliance assessment, or certification. The OWASP Top 10 is an awareness baseline, so passing this checklist does not prove that the application is free from vulnerabilities.

Primary reference: <https://owasp.org/Top10/>

## Summary

| OWASP Top 10:2025 category | Current controls | Residual risk / next step |
| --- | --- | --- |
| A01 Broken Access Control | Protected API routes; transaction queries include authenticated `user_id`; foreign key ownership; cross-account integration + E2E tests; foreign resources return 404 | Future user-owned categories/files must repeat the same ownership pattern; add explicit authorization tests whenever a new resource type appears |
| A02 Security Misconfiguration | Trusted host allow-list; restricted CORS; security headers; production API docs disabled; backend not published by Compose; container `no-new-privileges`; production config invariants | Production TLS terminator/domain configuration is deployment-specific; verify HSTS and TLS externally after deployment |
| A03 Software Supply Chain Failures | npm lockfile + `npm ci`; pinned GitHub Action SHAs; weekly Dependabot for pip/npm/actions; `pip-audit`; `npm audit` | Add SBOM/container-image scanning before a public production release |
| A04 Cryptographic Failures | Argon2 password hashing; JWT HS256 with mandatory 32-byte minimum secret; issuer/audience/jti/expiry validation; HttpOnly session cookie | No automated JWT secret rotation or server-side token revocation yet; add rotation/revocation if threat model or production scale requires it |
| A05 Injection | SQLAlchemy ORM/parameterized statements for user-controlled database access; Pydantic validation; React output escaping; CSP blocks arbitrary scripts | Continue avoiding dynamic SQL, unsafe HTML rendering, shell interpolation, and unvalidated file parsing when import features arrive |
| A06 Insecure Design | Per-user ownership is a server-side invariant; login/register edge rate limits; cross-site mutation guard; generic auth failures; reduced network exposure | Perform a fuller threat model before bank integrations, CSV/file ingestion, password reset, account deletion, or AI processing |
| A07 Authentication Failures | Argon2; 12-character registration minimum; generic login/registration errors; timing equalization for unknown users; short-lived signed session; rate limiting | Password reset/change and MFA are not implemented; rate-limit storage currently lives at the Nginx edge and must be preserved/replaced in another deployment architecture |
| A08 Software or Data Integrity Failures | Locked npm dependency graph; immutable Action SHAs; Dependabot; migration history; CI quality gate | Artifact signing/provenance and deployment attestations are not yet implemented |
| A09 Security Logging and Alerting Failures | Security event logs for register/login/logout/session failures/cross-site rejection; generated request IDs; application logs omit email/password/body/JWT/cookie | Logs are not centralized and there is no SIEM/alerting/retention policy; production monitoring remains required |
| A10 Mishandling of Exceptional Conditions | Database rollback on persistence failures; invalid tokens collapse to 401; unknown/foreign transactions collapse to 404; production debug disabled | Add explicit chaos/load/failure-path testing as external integrations are introduced |

## Detailed findings

### A01 - Broken Access Control

Transaction ownership remains the primary security boundary. Listing, updating, and deleting transactions require the authenticated user's UUID in the database query. Tests create two accounts and verify that one account cannot observe or mutate the other's records.

**Status:** mitigated for current transaction resources.

### A02 - Security Misconfiguration

The hardened baseline now includes:

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
- dependency checks included in the consolidated CI Quality gate.

**Residual:** container image vulnerability scanning and SBOM generation are good candidates before an Internet-facing release.

### A04 - Cryptographic failures

Passwords use Argon2 through `pwdlib`. Session JWTs require a minimum 32-byte secret and validate `sub`, `iat`, `exp`, `iss`, `aud`, and `jti`. Only HS256 is accepted by configuration.

Cookies are HttpOnly and SameSite=Lax. `AUTH_COOKIE_SECURE=true` is mandatory for staging and production.

**Residual:** logout deletes the browser cookie but does not revoke an already copied JWT server-side. Current exposure is bounded by the access-token lifetime.

### A05 - Injection

Current transaction/category/user queries use SQLAlchemy constructs rather than concatenated SQL. API request models constrain type, size, enum values, email format, and positive numeric amounts. The frontend does not currently render user content through unsafe raw HTML APIs.

The Nginx CSP disallows external/arbitrary script execution. Inline styles remain allowed because current UI/chart libraries depend on runtime style attributes; inline JavaScript remains disallowed.

### A06 / A07 - Insecure design and authentication

Login attempts are limited to five immediately accepted requests per source IP in the Nginx window; registration is limited more aggressively. The limiter returns HTTP 429 after the configured burst.

FastAPI also rejects browser-declared cross-site unsafe API requests when `Origin` is not the configured frontend or `Sec-Fetch-Site` is `cross-site`. This supplements SameSite cookies; it is not described as a universal CSRF solution for every future deployment architecture.

Unknown users perform a dummy Argon2 verification on login, reducing timing differences. Registration hashes the submitted password before duplicate-account rejection and returns a generic error.

### A09 - Security logging and alerting

Security events currently record only:

- event category;
- outcome;
- generated request ID;
- authenticated internal user UUID when relevant.

They deliberately exclude request bodies, passwords, emails, JWTs, session cookies, database URLs, and financial payloads. Nginx access logging uses `$uri` rather than the complete request URI, so query strings are not stored in the configured access log.

This follows the principle in the OWASP Logging Cheat Sheet that authentication events should be visible while session identifiers, access tokens, passwords, connection strings, keys, and sensitive personal/financial information should not be logged.

**Residual:** there is no centralized log store, immutable retention, alert routing, or incident-response automation yet.

### A10 - Mishandling of exceptional conditions

Persistence services roll back failed database transactions. Authentication failures intentionally expose generic responses. Production debug mode is rejected by configuration to avoid stack-trace disclosure.

Future external systems (bank APIs, file imports, AI providers) will need explicit timeout, retry, circuit-breaking, malformed-response, and partial-failure handling reviews.

## Verification checklist

Before merging a security-sensitive change:

```text
Backend tests + migrations       PASS
Frontend tests/typecheck/lint    PASS
Production frontend build        PASS
pip-audit                        PASS
npm audit (high/critical)        PASS
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
