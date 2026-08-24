# Security Policy

Smart Expense AI handles authentication credentials and personal financial data, so security reports are treated separately from ordinary bugs.

## Supported versions

Security fixes are maintained on the latest `main` branch. Older commits, local experiments, and abandoned feature branches are not supported releases.

## Reporting a vulnerability

Please **do not publish exploit details, credentials, tokens, personal data, or proof-of-concept payloads in a public issue**.

Preferred reporting path:

1. Open the repository **Security** tab.
2. Use **Report a vulnerability** / a private security advisory when GitHub exposes that option.
3. Include the affected component, reproduction steps, expected impact, and a minimal proof of concept that contains no real user data.

If private vulnerability reporting is unavailable, open a public issue containing only a short request for a private contact channel. Do not include technical exploit details in that issue.

This is a personal/portfolio project, so response times are best-effort. Valid reports will be reproduced, assessed for impact, fixed on a private branch when appropriate, and disclosed only after a remediation is available.

## Security boundaries

The current application assumes:

- HTTPS is mandatory for staging/production deployments;
- FastAPI is deployed behind the trusted reverse proxy rather than exposed directly to the Internet;
- deployment secrets are injected externally and are never committed;
- PostgreSQL is reachable only from the application network;
- the browser session token is stored only in an HttpOnly cookie;
- transaction ownership is enforced server-side with the authenticated user ID.

## Automated controls

Pull requests are expected to pass:

- backend tests and PostgreSQL migrations;
- frontend tests, type checking, linting, and production build;
- `pip-audit` against Python runtime dependencies;
- `npm audit` for high/critical findings in the locked npm dependency tree;
- authenticated Playwright E2E tests;
- Docker Compose smoke tests, including security headers and authentication rate limiting.

Dependabot monitors Python, npm, and GitHub Actions dependencies weekly.

## Secrets and sensitive data

Never commit or log:

- passwords or password hashes intended for real users;
- JWTs, session cookies, API keys, or encryption keys;
- database connection strings containing real credentials;
- financial transaction payloads from real users;
- private vulnerability reports.

Application security logs are intentionally limited to event type, outcome, request ID, and an internal user UUID after authentication. Request bodies, emails, passwords, and session tokens are excluded.

## Review baseline

The repository tracks a lightweight review against the **OWASP Top 10:2025** in `docs/SECURITY_REVIEW.md`. This is an engineering checklist and not a penetration-test result, certification, or claim of complete security.
