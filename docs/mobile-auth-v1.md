# Mobile Authentication v1

## Status

`mobile-auth-v1` adds a native Android credential transport without replacing or weakening the existing browser-cookie authentication contract.

The browser continues to use the existing HttpOnly cookie and web JWT audience. Android uses a separate short-lived Bearer JWT plus an opaque rotating refresh token.

## Transport split

```text
Browser
  -> HttpOnly SameSite cookie
  -> JWT aud=smart-expense-ai-web
  -> users.session_version

Android
  -> Authorization: Bearer <access-token>
  -> JWT aud=smart-expense-ai-mobile
  -> sid=<mobile_sessions.id>
  -> users.session_version
  -> mobile_sessions revocation/expiry

Refresh
  -> opaque random token
  -> SHA-256 digest in PostgreSQL
  -> one-time rotation lineage
```

A web JWT cannot be accepted as a mobile Bearer token and a mobile JWT cannot be accepted as the browser cookie because each decoder requires a different audience and mobile access tokens additionally require `sid` and `token_use=mobile_access`.

## Endpoints

All native endpoints are under API v2:

```text
POST /api/v2/auth/mobile/register
POST /api/v2/auth/mobile/login
POST /api/v2/auth/mobile/refresh
POST /api/v2/auth/mobile/logout
```

Register/login receive the installation `deviceId` and return:

```json
{
  "user": {
    "id": "...",
    "email": "...",
    "displayName": "..."
  },
  "tokenType": "Bearer",
  "accessToken": "...",
  "expiresIn": 900,
  "refreshToken": "..."
}
```

No mobile endpoint sets the browser session cookie.

## Access tokens

Mobile access tokens are signed by the backend and are intentionally short-lived. Validation requires:

- valid signature;
- issuer;
- mobile audience;
- expiry/issued-at/JTI;
- user subject;
- positive `session_version`;
- `token_use=mobile_access`;
- valid mobile session ID (`sid`);
- active user;
- current user `session_version`;
- non-revoked/non-expired `mobile_sessions` row.

The authenticated user ID always comes from the validated credential. Mobile clients never supply an authorization scope/user ID for protected financial endpoints.

## Refresh-token storage

The refresh token is an opaque cryptographically random value. PostgreSQL stores only:

```text
SHA-256(refresh token)
```

The raw refresh token exists only in the response and the device SecureStore.

`mobile_refresh_tokens` retains the rotation lineage using `used_at` and `replaced_by_id`. This is required to distinguish a normal replacement from reuse of an already rotated credential.

## Rotation and replay

A successful refresh:

1. locks the matching token/session;
2. validates device, user, session expiry and `session_version`;
3. creates a new random refresh token and stores its digest;
4. marks the previous token used and links its replacement;
5. issues a new short-lived access token;
6. returns the new raw refresh token exactly once.

If a previously rotated refresh token is presented again, the server treats it as replay and revokes the entire mobile session, including the current replacement token. The client must authenticate again.

## Revocation

### Logout

Mobile logout revokes the mobile session and its refresh tokens. The device then clears SecureStore credentials and all account-bound SQLite financial state.

Logout is idempotent from the client's perspective.

### Password change

The existing password-change flow increments `users.session_version`. A mobile access token carrying the previous version is immediately invalid. Refresh also verifies the session version and revokes the stale mobile session.

### Account deletion

`mobile_sessions.user_id` uses `ON DELETE CASCADE`; refresh-token rows cascade from the deleted mobile session. No mobile credential survives account deletion.

### Re-login on the same installation

A new login for the same user/device ID revokes previous active mobile sessions for that pair before issuing a replacement session.

## Device and local-data boundary

The Expo client stores its generated `deviceId`, access token, refresh token and cached account identity in Expo SecureStore, never SQLite.

SQLite stores only financial/offline data and sync state. `sync_state.local_account_id` binds the local workspace to the authenticated server account.

Before showing an authenticated workspace:

- matching account ID -> preserve local offline state;
- different/no bound account ID -> clear local entities/outbox/conflicts/cursors, then bind the new account;
- definitive invalid session -> clear credentials and local account data;
- transient network/server failure -> preserve cached account identity and offline SQLite state.

This prevents cross-account local leakage while retaining offline usability during connectivity failures.

## Edge protection

Nginx applies the existing login/register throttling policy to native login/register and a separate bounded refresh rate to the refresh endpoint.

Security logs contain event/outcome/request/user identifiers only. Raw access tokens, refresh tokens, passwords and email credentials are not logged.

## Phase boundary

`mobile-auth-v1` does not itself execute `sync-v1`. Phase 5E will consume the access token from SecureStore, refresh it when necessary and connect the existing SQLite outbox/replica to `/api/v2/sync/bootstrap`, `/push` and `/pull`.
