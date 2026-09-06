# Managed deployment and store publication

## Status and ownership

This is a source-controlled deployment proposal, not evidence of an active service or a published app. No owner-controlled Render workspace, EAS project, upload key or Google Play application has been linked. No cloud resources have been provisioned by this change. CI compilation artifacts remain unsuitable for distribution.

The proposed host is Render in Frankfurt. `render.yaml` uses paid compute and PostgreSQL plans; obtain the actual workspace quote and the owner's budget before creating resources. Service sizes are an initial staging proposal, not a demonstrated production capacity estimate. Do not silently enable billing, substitute a different owner or deploy to an assistant-owned account.

Required owner inputs:

- Render account/workspace and authorized billing budget, or an explicit alternative hosting provider.
- Public web domain or the actual HTTPS URL allocated by Render.
- Expo/EAS owner or organization and Google Play developer application access. Confirm that `com.davidegea.smartexpenseai` is the intended permanent package identifier before its first upload.
- Operator identity, support/privacy contact, retention and backup policy, and the final public privacy notice. `privacy.md` remains a technical draft.
- Store identity/branding, real release screenshots, target audience/content declarations and review access for the signed-in functionality.

Secrets belong in provider-managed credential storage. Do not paste access tokens, database credentials, service-account JSON or signing keys into chat or commit them.

## 1. Review and deploy staging

1. Finish repository CI and Android Native E2E for the exact source revision. Review the Docker image/security results. Automatic Render deployment is disabled so a later unrelated commit cannot change this release implicitly.
2. In the owner's Render workspace, preview the Blueprint from `render.yaml`, review the quote and confirm the region. Keep FastAPI private and PostgreSQL's external IP allowlist empty. Only the Nginx web service receives public traffic.
3. Obtain the actual web-service URL from Render or configure the owner's verified domain. Supply this exact HTTPS origin in the API's `FRONTEND_ORIGIN`. If the URL is not assigned when the Blueprint first prompts, create the resources without accepting a working backend, then set the allocated URL and deploy the backend. Never supply a guessed or example domain as completed configuration. Startup intentionally fails while required settings are absent.
4. Render generates `JWT_SECRET` and connects the managed database's internal DSN. Use `APP_ENV=staging`, `APP_DEBUG=false` and `AUTH_COOKIE_SECURE=true`. The wrapper derives the allowed host from the public origin and rejects insecure/incomplete settings without printing secrets.
5. Deploy the API revision. Its pre-deploy command applies Alembic migrations once, before Uvicorn starts. Do not run the development Compose configuration on the public host.
6. Deploy the web service at the same revision after the API is healthy. The entrypoint adapts Nginx to Render's private API hostname and `PORT`, preserves the existing API routes/auth limits/CSP, and treats Render's public edge as the TLS terminator. The original local Compose path remains available.
7. Record service/database IDs, region, deployment IDs, source revision and public origin. Keep credentials out of that record.

The health route tests API reachability. It does not by itself prove database persistence, correct browser authentication or mobile sync. Use the acceptance checks below before promotion.

## 2. Verify the real ingress and persistence

Use disposable test accounts without real financial records:

- Confirm the public origin serves HTTPS, the UI, `/health` and `/account-deletion.html`. Verify HTTP redirects to HTTPS, secure authentication cookies, expected security headers and same-origin web API calls.
- Register/sign in through the web and mobile auth routes; verify the database can persist a transaction across service restarts and the web client can read a mobile-created record.
- Verify cross-site mutation rejection and existing authentication limits at the actual public edge. The template deliberately does not trust arbitrary forwarded-IP headers. Render's proxy can cause Nginx to see a shared source address: validate per-client behavior and configure provider-supported trusted ingress/rate limiting before a public launch. Keep the limits enabled during staging.
- Check logs contain request identifiers and minimized operational events, without tokens, passwords or financial payloads. Define retention and operational alert recipients in the actual hosting account.
- Complete a database backup and restore exercise into an isolated database; define RPO/RTO and retention. A running database alone is not backup evidence.
- Exercise mobile account deletion with a disposable account: wrong password and offline attempts preserve the account; successful confirmation removes server data and credentials/local account data; revoked sessions cannot refresh. Confirm the web deletion path also works without installing Android.

Do not expose staging to real users while the privacy notice, recovery operations or ingress checks remain incomplete. If migrations fail, stop the release; do not automatically downgrade a populated database. Application rollback must use a revision compatible with the current schema, or an explicitly reviewed restore plan.

## 3. Produce and accept signed Android builds

Follow [android-release.md](android-release.md) to link the owner-controlled EAS project, set the actual HTTPS API URL in the `preview` and `production` EAS environments, configure managed signing, and produce the preview APK. Complete the physical-device/offline/upgrade acceptance sequence before building the production AAB.

Promote only after staging acceptance: provision or identify the production database and domain, set `APP_ENV=production` and the matching `FRONTEND_ORIGIN`, retain secure cookies/debug-off settings, and repeat the real-environment checks. A preview connected to staging does not validate the production endpoint.

The production AAB must use the verified production URL and preserve the correct application/upload signing identity. Record EAS build IDs, revision, versionCode, checksums, signing certificate and device results. Do not upload the CI compilation AAB.

## 4. Prepare Play Console and submit

1. Complete developer-account verification and create/link the correct Play application. Configure its Google service account in EAS with the minimum release permissions required for that application.
2. Complete the store listing using verified features; see [store-listing-es.md](store-listing-es.md). Supply owner-approved app icon/feature graphic and screenshots from the actual signed app. Do not represent mockups or emulator debug builds as release-device evidence.
3. Publish a completed privacy notice on the real domain and add it to both Play Console and the app. Review the data-safety form against the actual release/deployed processors, including account identifiers, financial records and device/session information. Do not claim the service is fully offline or that AI output is financial advice.
4. Add the real `/account-deletion.html` URL to the deletion section. Before publication, supplement this page with the completed privacy/contact link and the actual retention exceptions for backups/logs. Verify it loads without authentication and that users can follow its sign-in/Security steps without needing the Android app. Verify Android's Account deletion control in the signed build.
5. Complete content rating, audience, ads and any applicable financial-features declarations. Provide approved reviewer access to signed-in features. Confirm account-specific testing and production-access requirements in Play Console.
6. Submit the exact accepted production build to an internal draft release, from `mobile/`:

   ```bash
   eas submit --platform android --profile internal --id "$ACCEPTED_EAS_BUILD_ID"
   ```

   The `internal` profile selects `track=internal` and `releaseStatus=draft`. Review the resulting versionCode in Play Console, finish missing declarations and publish the internal test release to the owner's selected testers. A successful EAS upload or a draft is not a live release.
7. Install the Play-delivered build via its testing link and repeat the critical auth/offline/sync/deletion/upgrade checks. Complete any required closed test and obtain production access. New personal developer accounts may require 12 continuously opted-in testers for 14 days; confirm applicability to this account, not just the application's age.
8. Promote the accepted versionCode from testing to production in Play Console after account requirements and release checks are met. The `production` submission profile is also draft-only for cases requiring a new production upload; do not upload the same versionCode twice or accidentally choose a newer unaccepted EAS build.
9. Submit for review, handle review findings and release through the owner's chosen rollout. Verify the public store page and installation when Google makes it available. Monitor production error/auth/sync behavior during rollout and retain rollback instructions.

## Closure record

Leave deployment/distribution roadmap items open until this record has real evidence:

| Evidence | Current status |
| --- | --- |
| Hosting workspace, service IDs, deployment IDs and HTTPS URL | Not provisioned |
| Migrations, persistence, ingress and backup/restore acceptance | Not run on a deployed host |
| Completed privacy/support/deletion URLs and store declarations | Awaiting operator details and deployment |
| EAS project ownership and signing certificate | Not linked |
| Signed preview APK / production AAB and checksums | Not built |
| Physical-device and Play-delivered acceptance | Not run |
| Play application, review/rollout and public listing | Not submitted |

## Official references

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render web services and HTTPS](https://render.com/docs/web-services)
- [EAS Submit for Android](https://docs.expo.dev/submit/android/)
- [EAS submission configuration](https://docs.expo.dev/eas/json/)
- [Google Play account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Google Play testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
