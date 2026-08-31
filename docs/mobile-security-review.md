# Mobile Security Review

Status: Phase 5G implementation review for the Android-first Expo/React Native client.

## Security boundary

FastAPI/PostgreSQL remains the authoritative financial system. Android stores a local replica, queued user intent, conflict evidence and selected read-only server snapshots. The mobile application never receives backend database credentials, JWT signing secrets or LLM/provider API keys.

Authentication uses short-lived mobile-audience access tokens and rotating opaque refresh tokens. Credentials and the local database encryption key are stored in Expo SecureStore rather than SQLite.

## Threats and controls

### Device file extraction

Risk: an attacker obtains the application data directory or a copied SQLite database.

Controls:

- `expo-sqlite` is built with SQLCipher enabled;
- a 256-bit random raw database key is generated with `expo-crypto` and stored only in SecureStore;
- the key is applied immediately after opening SQLite and before migrations or application queries;
- startup verifies that the native SQLite build exposes SQLCipher and forces an immediate schema-page read so a missing/wrong key fails closed;
- Android Auto Backup is disabled so encrypted database files are not restored without their device-bound secrets;
- SQLite `secure_delete` is enabled;
- logout/account-boundary erasure truncates WAL and runs `VACUUM` after deleting account-scoped rows.

Residual risk: a fully compromised/unlocked device with code execution in the application context can access data while the application itself can decrypt it. SQLCipher is an at-rest control, not protection against a compromised runtime.

### Legacy plaintext replica

Risk: upgrading an existing development install leaves a plaintext financial replica behind or loses queued offline mutations.

Controls:

- Phase 5G uses a new encrypted database filename;
- when the encrypted database is empty, the client checks for the legacy schema;
- the legacy WAL is checkpointed before migration;
- the legacy database is attached to the already-keyed SQLCipher connection with an explicit empty key and copied with `sqlcipher_export('main', 'legacy_plaintext')`, the supported SQLCipher path for plaintext-to-encrypted conversion;
- SQLite `user_version`, which `sqlcipher_export()` deliberately does not transfer, is preserved explicitly before normal schema migrations continue;
- the exported destination is checked for the application schema;
- the plaintext legacy database is deleted only after export, version restoration and destination verification all succeed;
- any export/detach/verification failure leaves the plaintext source intact rather than risking silent data loss.

The SQLite Online Backup API is deliberately not used for this conversion because SQLCipher does not support using it to change a database between plaintext and encrypted modes.

### Cross-account local leakage

Risk: one account sees a prior account's replica or cached analytics on a shared device.

Controls:

- the local account id is bound in SQLite;
- switching to a different account invokes the same full account-data erasure boundary before binding the new id;
- logout first stops future background scheduling, then obtains the SQLite runtime lease and completes the privacy wipe before local credentials are cleared and the UI transitions to signed-out;
- if the privacy wipe cannot obtain exclusivity, logout fails instead of presenting a false successful-logout state;
- any startup without a valid restored mobile session invokes the same local wipe, including confirmed remote session revocation;
- the wipe erases transactions, categories, budgets, outbox, conflicts, sync state and server-derived cache.

### Background synchronization races

Risk: WorkManager and a foreground sync manipulate the same outbox concurrently.

Controls:

- both entry points use one SQLite-backed runtime lease;
- lease acquisition occurs inside an exclusive SQLite transaction;
- a second synchronizer skips instead of resetting another synchronizer's `sending` mutations;
- the lease has a bounded expiry for crash recovery;
- privacy-boundary wipes acquire the same lease before deleting local data;
- server mutation IDs remain idempotent, so a transport retry cannot duplicate a committed financial write.

Background execution is opportunistic. Foreground sync remains the correctness path because Android WorkManager scheduling is inexact and OS-controlled.

### Token theft/replay

Controls already present before Phase 5G:

- access and refresh tokens are never stored in SQLite;
- refresh tokens rotate and server-side replay detection revokes the mobile session;
- concurrent 401 responses share a single refresh operation;
- remote logout failure does not prevent local credential clearing after the privacy wipe has completed;
- server-side account/session revocation invalidates subsequent mobile refresh.

### Build and signing secrets

Controls:

- `EXPO_PUBLIC_*` is treated as public build-time configuration only;
- no signing key, Expo token, Google service-account credential or provider secret is committed;
- `eas.json` defines preview APK and production AAB profiles without embedding credentials;
- EAS/Google Play credentials must live in their managed secret/credential stores;
- Mobile CI runs Expo dependency checks, Jest, strict TypeScript, ESLint, native prebuild, Gradle debug compilation and Android JS export.

## Release gates

Before a production Play release:

1. Mobile CI and repository Quality Gate must be green on the exact release SHA.
2. A production EAS AAB must build using managed signing credentials.
3. Android offline/reconnect/conflict flows must be exercised on an emulator or physical development build, not Expo Go (SQLCipher is not available in Expo Go).
4. The plaintext-to-SQLCipher upgrade must be exercised on a native Android installation containing pre-5G local data and pending outbox state.
5. Logout must be verified to remove account-scoped local rows and cached read models.
6. Remote account deletion/revocation must be verified to invalidate mobile credentials and clear local account data on the next session restore.
7. No `EXPO_PUBLIC_*` variable may contain credentials or secrets.
8. Store privacy/data-safety declarations must match actual local storage, analytics and network behavior.

## Deferred hardening

- device/emulator end-to-end automation for offline/reconnect/conflict flows;
- production AAB build evidence and Play internal-testing release;
- runtime crash/performance monitoring selection and privacy review;
- optional biometric application lock, if product requirements justify the additional UX and recovery complexity;
- iOS-specific background/security validation when iOS becomes a release target.
