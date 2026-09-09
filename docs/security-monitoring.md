# Centralized security monitoring

Smart Expense AI exposes a provider-neutral `security-event-v1` stream for security monitoring and alert routing. The application does not require a specific SaaS vendor: staging and production provide an HTTPS webhook owned by the deployment environment, while development/test/Docker may run with local structured logging only.

## Event contract

Security-sensitive paths emit compact JSON records through the `smart_expense.security` logger and, when configured, enqueue the same record for central delivery.

A record contains only:

- `schemaVersion` (`security-event-v1`);
- UTC `timestamp`;
- fixed service name `smart-expense-api`;
- application `environment`;
- stable `event` and `outcome` identifiers;
- log `severity`;
- the request correlation `requestId`;
- an `alert` boolean (`true` for WARNING/ERROR and above);
- authenticated account UUID as `userId` only when the emitting path already has an authenticated user.

The event contract deliberately excludes email addresses, passwords, cookies, authorization headers, access/refresh tokens, request/response bodies, query strings and client IP addresses. The central destination must still be treated as security-sensitive because account UUIDs and authentication activity are operational metadata.

## Covered signals

The existing web and mobile authentication flows feed the central pipeline, including successful/rejected registration and login, logout, password changes, privacy export, account deletion, mobile refresh rejection/replay detection and mobile logout. The HTTP security middleware also emits rejected cross-site mutations and unexpected/unhandled 5xx failures.

WARNING/ERROR events set `alert=true`; INFO events remain centrally observable with `alert=false`. The receiving platform can route `alert=true` records to paging/chat/email policy without changing application code.

## Delivery semantics

Central delivery is intentionally asynchronous and fail-open:

1. the API writes the structured event to its normal logger;
2. the event is placed on a bounded in-process queue without waiting for the monitoring provider;
3. a daemon worker POSTs JSON to the configured webhook with a short timeout;
4. non-2xx responses, network errors or provider failures never fail the user request;
5. delivery failures and queue drops are written locally as `security_monitor_delivery` ERROR records without provider responses, exception text, URLs or credentials.

This avoids turning a monitoring outage into an authentication outage. The bounded queue also prevents an unavailable destination from producing unbounded memory growth. Central systems should independently monitor `security_monitor_delivery` local logs and the absence of expected heartbeat/application telemetry.

## Configuration

Backend-only environment variables:

```text
SECURITY_ALERT_WEBHOOK_URL=https://security.example.com/events
SECURITY_ALERT_BEARER_TOKEN=<optional secret>
SECURITY_ALERT_TIMEOUT_SECONDS=2
SECURITY_ALERT_QUEUE_SIZE=256
```

`SECURITY_ALERT_WEBHOOK_URL` is mandatory for `APP_ENV=staging` and `APP_ENV=production`, and it must be HTTPS in those environments. Embedded URL credentials are rejected. The optional bearer token is sent only in the outbound `Authorization` header and must come from the deployment secret store.

Development/test/Docker environments may leave the webhook blank; structured local security logs remain enabled.

## Operational expectations

The central receiver should:

- retain the original JSON event and request ID;
- alert on `alert=true`, especially `mobile_refresh/replay_rejected`, repeated login rejection, cross-site rejection and server-error events;
- apply aggregation/rate policy centrally rather than embedding provider-specific thresholds in the application;
- restrict access and define a retention period appropriate for security metadata;
- redact its own transport diagnostics and never echo bearer credentials;
- correlate application request IDs with reverse-proxy/runtime logs.

The application-level control does not replace deployment work still tracked separately: TLS/domain configuration, secret-store provisioning, staging/production infrastructure and host/cloud monitoring remain deployment responsibilities.
