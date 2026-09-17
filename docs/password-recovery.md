# Authentication reliability and password recovery

Web and Android use the same public FastAPI recovery endpoints. Email links open the web reset form in this release; Android also exposes public `forgot-password` and `reset-password` screens. Verified Android HTTPS App Links are a separate release task.

## API and security

- `POST /api/v1/auth/password-reset/request`, body `{ "email": "user@example.com" }`: HTTP 202 with `If an account exists for that email, you will receive instructions to reset your password.` Unknown, inactive and email-throttled accounts receive the same response. No account lookup or provider call occurs before the response is sent; a background task handles both known and unknown addresses.
- `POST /api/v1/auth/password-reset/confirm`, body `{ "token": "…", "newPassword": "…" }`: HTTP 204 on success; HTTP 400 for an unknown, expired or used token. Passwords use the existing 12–128 character policy and Argon2 hasher. Opening a link never changes a password or consumes the token.
- Tokens contain 256 bits from `secrets.token_urlsafe(32)`, expire after 20 minutes (configurable between 15 and 30), and are stored only as SHA-256 hashes. Raw tokens appear only in the email and transient client/server memory. Links use a configured URL, never the request Host or a client-supplied redirect.
- Confirmation locks the user first, then the token. Password update, `session_version` increment, revocation of every active `MobileSession`, and consumption of all pending reset tokens commit together. Both reuse of one link and concurrent use of two different links are covered by PostgreSQL integration tests.
- Revoked mobile sessions make their entire refresh-token family unusable. Existing web cookies and mobile access JWTs fail the version check. Confirmation clears the current browser cookie and does not create a new session. Normal authenticated password changes invalidate outstanding recovery links too.
- Revocation is enforced at the next server request. A disconnected phone cannot learn about remote revocation until it reconnects; existing encrypted offline data and the app's local lock follow the established offline policy. Do not describe this as remote deletion from an offline device.
- PostgreSQL fixed-window limits: recovery requests 10 per IP / 15 minutes, 3 per email / hour; confirmation 20 per IP / 15 minutes. Email limits are silent; IP limits return 429 with `Retry-After`. Counters use HMAC keys, expire and are cleaned as requests arrive, and work across workers/restarts. Nginx applies an additional recovery route limit.
- Only explicitly trusted proxy peers can supply `X-Real-IP`. Nginx overwrites that header. No arbitrary `X-Forwarded-For` is trusted. If the hosting edge presents a shared proxy address, the IP budget is shared too; configure trusted client-IP handling at the edge before increasing traffic, never trust all forwarded headers.
- Tokens and passwords are absent from application error envelopes/security logs. Nginx logs `$uri`, without query strings; recovery pages have no-store and no-referrer protection. The web form removes the token from browser history immediately and keeps it only in component memory. Reloading then requires reopening the email. Disable email click tracking for recovery mail in the selected provider.

A new request does not invalidate an earlier valid link: otherwise someone who knows an email address could continuously break the owner's recovery attempt. A successful reset or authenticated password change invalidates every outstanding link. Expired token records are removed opportunistically after one day.

## Provider configuration (backend only)

The default is `EMAIL_PROVIDER=disabled`. In that state request returns the same 503 for every email rather than pretending an email was sent. The rest of authentication continues to work.

Set these environment variables on the existing backend service:

```dotenv
EMAIL_PROVIDER=brevo
EMAIL_API_KEY=<provider secret entered in the hosting dashboard>
EMAIL_FROM_ADDRESS=<verified sender email>
EMAIL_FROM_NAME=Smart Expense AI
PASSWORD_RESET_PUBLIC_URL=https://smart-expense-free.onrender.com/reset-password
PASSWORD_RESET_TTL_MINUTES=20
```

For Resend, change `EMAIL_PROVIDER=resend`, the key and the verified sender. No client build contains these secrets. Both adapters send only a reset link; neither generates or emails a password. Requests use HTTPS with bounded provider timeouts, and provider response bodies/errors are never logged.

No new hosting service, paid plan, Redis, queue or domain purchase is provisioned by this change. An operator must create/configure a provider account and verify its sender according to that provider's requirements. Resend generally requires a verified domain for real recipients; the assigned `onrender.com` domain is not a domain the application owner can verify. Check the selected free plan and sender requirements in the provider dashboard before activation.

Mail is sent in a FastAPI background task after the response, without storing plaintext reset secrets in a durable queue. If the process stops between acknowledgment and delivery, the user must request another link. Provider failure invalidates that undelivered link, emits a sanitized `password_reset_delivery outcome=failed` event and leaves earlier links/passwords intact. The neutral response remains unchanged. Monitor that event and provider delivery status; a 202 does not prove delivery.

## Cold starts

Web login/session restoration and Android login allow one retry after 1.5 seconds, only for a network error, a 60-second timeout or HTTP 502/503/504. The maximum two attempts are visible through the connecting message. HTTP 401/403/422/429 and ordinary server errors are not retried. Registration, recovery request/confirmation and rotating refresh operations are not automatically replayed. Android cancellation prevents a backoff timer from reviving a cancelled login.

## Deployment and acceptance

1. Apply migration `0014_password_recovery` before serving the updated API. Existing Render Free startup already runs `alembic upgrade head` before opening its listener.
2. Deploy the matching web/backend revision; distribute a new Android build to obtain the new screens and retry behavior.
3. Configure the provider secret, verified sender and fixed public reset URL. Until these are present, recovery is explicitly unavailable.
4. Use a dedicated test account to request a real email, inspect spam delivery and URL/expiry, reset once, reject reuse and verify older web/Android sessions cannot access the API. Never put the real link or API key in logs, PR comments or screenshots.

## Automated verification

- Backend integration exercises neutral responses, hashed token storage, expiry, inactive accounts, password policy, request and confirm throttling, sanitized delivery failures, account deletion, CSRF, session revocation, transaction rollback and concurrent confirmations against PostgreSQL.
- Provider unit tests exercise both real HTTP adapter payloads through an in-memory transport. No email is sent by tests.
- Web component/retry tests and Playwright exercise the public routes, removal of the URL token, matching passwords, email capture, reset, reuse rejection, old-session rejection and new-password login.
- Android unit tests cover UI and client behavior, timeout/retry/cancellation, shared endpoints and 204 responses. Maestro flows 18/19 request a recovery email and reset/reuse the captured link through native screens before the existing offline suite.
- `backend/e2e_app.py` is a test-only entry point guarded by `APP_ENV=test` plus `E2E_RECOVERY_OUTBOX`. It captures synthetic emails in private files, exposes no token HTTP endpoint, and is never imported by production. The outbox is excluded from CI artifacts.

Provider contracts: [Brevo transactional email API](https://developers.brevo.com/reference/send-transac-email), [Resend send email API](https://resend.com/docs/api-reference/emails/send-email). Security reference: [OWASP password recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
