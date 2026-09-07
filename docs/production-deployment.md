# Zero-budget hosting and store publication

## Status and ownership

The owner has set a hard hosting budget of **0 EUR/year**. The earlier paid infrastructure proposal is withdrawn. Render is connected and lists `My Workspace`; no resources have been created. Neon, the EAS project and the Google Play application remain unlinked. This document is not evidence of an active service or a published app.

The new Blueprint has one Render Free web service in Frankfurt. A combined Docker image serves the web UI through the existing Nginx edge and binds FastAPI only to loopback inside the same container. PostgreSQL is external on the owner's Neon Free project. There are no Render database, private-service, disk, worker or paid compute resources in `render.yaml`. CI compilation artifacts remain unsuitable for Android distribution.

## Budget and availability limits

- Use the provider's free plans and included subdomain; no custom-domain purchase, paid upgrade or trial that converts to billing is authorized.
- Before applying, verify the Render workspace's billing state. `plan: free` alone is not a total spend cap: bandwidth/build overages can be billed if a payment method is present. The documented no-payment-method behavior suspends services/builds instead. Set the build spending limit to zero where applicable; do not alter unrelated account billing settings. If zero total spend cannot be ensured, leave provisioning blocked.
- Render Free sleeps after 15 minutes idle and typically needs about a minute to wake. It has an ephemeral filesystem and a shared allowance of 750 service hours/month. Do not store the server's financial records in local SQLite or use scheduled keep-alive traffic.
- Render's Free PostgreSQL expires after 30 days, so it is deliberately excluded. Neon currently advertises a Free plan without a time limit or required credit card, with 0.5 GB storage and 100 CU-hours per project/month. Verify the owner's current plan and quotas before creating the project; stop at free limits rather than upgrade.
- The image uses one API worker and limits numerical-library threads. CI exercises startup and a basic persistence flow at 512 MiB; this is not proof of capacity under a growing financial dataset or concurrent analytics load. Cold-start behavior, service quotas, external-database traffic and recovery still require deployed acceptance. Treat this as a limited personal/beta environment, not guaranteed 24/7 production hosting.
- `OPENAI_API_KEY` is blank by default. Existing local classification and deterministic analysis remain available; the external LLM assistant requires separate credentials and costs. EAS and Google Play account/build/distribution requirements are separate from hosting and are not declared free by this proposal.

References: [Render Free limits](https://render.com/docs/free), [Neon Free pricing](https://neon.com/pricing). These are current allowances, not a promise that providers will keep them unchanged forever.

Required owner inputs:

- Confirmation of the Render workspace and its zero-spend billing setup, plus access to the owner's Neon Free project.
- The actual HTTPS URL allocated by Render (automatically supplied at runtime; no domain purchase needed).
- Expo/EAS owner or organization and Google Play developer application access. Confirm that `com.davidegea.smartexpenseai` is the intended permanent package identifier before its first upload.
- Operator identity, support/privacy contact, retention and backup policy, and the final public privacy notice. `privacy.md` remains a technical draft.
- Store identity/branding, real release screenshots, target audience/content declarations and review access for the signed-in functionality.

Secrets belong in provider-managed credential storage. Do not paste access tokens, database credentials, service-account JSON or signing keys into chat or commit them.

## 1. Review and deploy staging

1. Finish repository CI, the combined-image security/runtime check and Android Native E2E for the exact revision. Merge the accepted Blueprint before provisioning. Automatic deployment remains disabled.
2. Link the owner's Neon account, verify it is on Free and create a PostgreSQL 16 project near Frankfurt. Use the direct endpoint for migrations in this initial single-instance deployment. Store its connection URL as the Render service's `DATABASE_URL`; never paste credentials into chat or the repository. The runtime upgrades TLS to hostname/certificate verification using the image's CA bundle and fails on explicitly disabled TLS.
3. Review the Blueprint in Render's Dashboard after confirming the workspace and zero-spend billing condition above. The connected tools cannot create this Docker service directly. Verify the preview contains exactly one Free web service and no database, paid resource or disk.
4. Supply `DATABASE_URL` in the Dashboard. Render generates `JWT_SECRET`. Keep `APP_ENV=staging`, `APP_DEBUG=false` and `AUTH_COOKIE_SECURE=true`. The wrapper uses Render's actual `RENDER_EXTERNAL_URL` as the public origin, derives the allowed host and rejects incomplete settings. No guessed hostname is necessary.
5. Apply the Blueprint. The image applies migrations during startup before opening its public listener because Free has no separate pre-deploy command. It then supervises Uvicorn and Nginx together, shutting both down if either exits. The API listens only on `127.0.0.1:8000`; the edge listens on `PORT` and retains the existing API routes, auth limits and security headers.
6. Verify the service and record its ID, deployment ID, source revision, public origin and Neon project/branch IDs. The Docker/Compose development workflow remains separate.

The health route tests API reachability. It does not by itself prove database persistence, correct browser authentication or mobile sync. Use the acceptance checks below before promotion.

## 2. Verify the real ingress and persistence

Use disposable test accounts without real financial records:

- Confirm the public origin serves HTTPS, the UI, `/health` and `/account-deletion.html`. Verify HTTP redirects to HTTPS, secure authentication cookies, expected security headers and same-origin web API calls.
- Register/sign in through the web and mobile auth routes; verify the database can persist a transaction across service restarts and the web client can read a mobile-created record.
- Allow a real idle suspension, then reopen Android and the web client. An initial timeout while the service wakes must preserve the offline account/outbox; retry after wake and verify synchronization. Do not hide this behavior with artificial keep-alive jobs.
- Verify cross-site mutation rejection and existing authentication limits at the actual public edge. The template deliberately does not trust arbitrary forwarded-IP headers. Render's proxy can cause Nginx to see a shared source address: validate per-client behavior and configure provider-supported trusted ingress/rate limiting before a public launch. Keep the limits enabled during staging.
- Check logs contain request identifiers and minimized operational events, without tokens, passwords or financial payloads. Define retention and operational alert recipients in the actual hosting account.
- Complete a database backup and restore exercise into an isolated database; define RPO/RTO and retention. A running database alone is not backup evidence.
- Exercise mobile account deletion with a disposable account: wrong password and offline attempts preserve the account; successful confirmation removes server data and credentials/local account data; revoked sessions cannot refresh. Confirm the web deletion path also works without installing Android.

Do not expose staging to real users while the privacy notice, recovery operations or ingress checks remain incomplete. If migrations fail, stop the release; do not automatically downgrade a populated database. Application rollback must use a revision compatible with the current schema, or an explicitly reviewed restore plan.

## 3. Produce and accept signed Android builds

Follow [android-release.md](android-release.md) to link the owner-controlled EAS project, set the actual HTTPS API URL in the `preview` and `production` EAS environments, configure managed signing, and produce the preview APK. Complete the physical-device/offline/upgrade acceptance sequence before building the production AAB.

Promote only after acceptance and the owner's intended release scope are established. Keep the 0 EUR budget: do not create a second paid environment. If this same service becomes the accepted release endpoint, retain its database and allocated HTTPS origin, set `APP_ENV=production`, and repeat checks. This environment flag does not remove free-tier availability or quota limits.

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
| Hosting budget | 0 EUR/year; paid configuration withdrawn |
| Render workspace | Connected; resource/billing confirmation pending |
| Neon Free project, service IDs, deployment IDs and HTTPS URL | Not provisioned |
| Migrations, persistence, ingress and backup/restore acceptance | Not run on a deployed host |
| Completed privacy/support/deletion URLs and store declarations | Awaiting operator details and deployment |
| EAS project ownership and signing certificate | Not linked |
| Signed preview APK / production AAB and checksums | Not built |
| Physical-device and Play-delivered acceptance | Not run |
| Play application, review/rollout and public listing | Not submitted |

## Official references

- [Render Blueprint specification](https://render.com/docs/blueprint-spec)
- [Render web services and HTTPS](https://render.com/docs/web-services)
- [Render allocated environment variables](https://render.com/docs/environment-variables)
- [Neon connection security](https://neon.com/docs/connect/connect-securely)
- [EAS Submit for Android](https://docs.expo.dev/submit/android/)
- [EAS submission configuration](https://docs.expo.dev/eas/json/)
- [Google Play account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Google Play testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
