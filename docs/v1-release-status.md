# Android V1 release boundary

This record separates a downloadable release candidate from an accepted stable Android release.
The product-wide candidate is `v1.0.0-rc.2`; Android uses versionName `1.0.0-rc.2` and versionCode `5`.
Backend API version `1.4.0` is an independent API version and is not being downgraded.

## Observed deployment

On 2026-09-26 Render reports an existing Free service, `srv-dafa16740ujc73abp560`, in Frankfurt,
with automatic deployment disabled and public origin `https://smart-expense-free.onrender.com`.
The initial observed live deployment was `dep-damgk4h42hec7391k2vg`, commit
`0929ab9a33d4367f1bad014d3479b324cf05e3bd` (PR #115). PR #117 requires migrations
0015–0017 before Android distribution. This historical observation is not a claim that the
latest source has already been deployed. Render's current deploy record is authoritative.

`Deployed HTTPS smoke` is a manual, read-only workflow. It checks TLS, security headers,
the web/deletion documents and authenticated-route rejection, retaining an aggregate JSON
report. It sends no email, credentials or financial data. It does not prove migration state,
database persistence, backup restoration, real mail delivery or authenticated sync.
It is intentionally not a scheduled keep-alive for the sleeping Free service.

## Candidate publication

After all exact-source checks succeed and the source is merged into `main`, run
`Installable Android preview` with `release_tag=v1.0.0-rc.2`, or create an
`android-preview/v1.0.0-rc.2` branch at that reviewed commit. Release source verification
requires the newest GitHub Actions check run on that exact SHA to be successful for:

- `Quality gate`, `Mobile quality` and `Android emulator E2E`;
- all four container-image security jobs (backend, frontend, PostgreSQL and Render Free);
- the backend/frontend CycloneDX SBOM job;
- labelled benchmark integrity and lifecycle diagnostic;
- category-classifier, spending-forecast and anomaly-challenger benchmarks.

An older green execution cannot mask a newer failed rerun. The workflow then verifies the live
ingress, signs and inspects the APK, and launches it without Metro. Only after success does it
create a semantic **prerelease**, with APK, SHA-256, certificate, source revision, backend smoke
and emulator evidence. Existing tags are not overwritten.

The candidate download remains the isolated `.preview` application with a temporary key.
Synchronize pending changes before uninstalling an earlier preview. A candidate is not the
permanent Play application and does not close the signed-distribution roadmap item.

## Permanent APK and AAB

`Signed Android distribution` is manual and runs only on `main`. It requires the same complete
exact-source certification above and a reachable HTTPS backend before building. Configure the
owner-controlled `android-production` GitHub Environment with these values:

| Kind | Name | Meaning |
| --- | --- | --- |
| Secret | `ANDROID_KEYSTORE_BASE64` | Base64 of the existing permanent/upload keystore |
| Secret | `ANDROID_STORE_PASSWORD` | Keystore password |
| Secret | `ANDROID_KEY_PASSWORD` | Signing key password |
| Secret | `ANDROID_KEY_ALIAS` | Alias in that keystore |
| Variable | `ANDROID_CERT_SHA256` | Public certificate SHA-256, independently recorded by the owner |

Restrict this environment to protected `main`, and configure its required reviewer when
an additional release reviewer is available. Environment settings must be verified in GitHub;
merely naming an environment in YAML does not configure its protections.

Do not generate a replacement if the app already has a permanent signing identity. Keep an
encrypted recoverable backup under the owner's control. This alternative uses ordinary hosted
GitHub runners and local Gradle; it does not require paid EAS compute or a linked EAS project.
EAS remote signing remains supported by the existing `eas.json` profiles.

The workflow verifies matching APK/AAB certificates, APK manifest/package/version, native
architectures and the embedded real API URL in both bundles. The AAB is cryptographically
verified with `jarsigner`; the APK with `apksigner`, including ZIP alignment. It records public
hashes and certificate identity in `build-info.json`, and retains the artifacts for 14 days.
It does not automatically publish them or claim device/Play acceptance.

Install the permanent APK on the physical device and complete `android-release.md`, including
offline **Mi dinero** changes/history, account isolation and an in-place upgrade preserving
pending encrypted data. Copy the template, enter the exact build identity/hashes and only
record steps that actually pass. Then validate the original downloaded bytes:

```bash
python scripts/verify-release-acceptance.py \
  --artifacts dist/android-distribution \
  --acceptance path/to/completed-physical-acceptance.json
```

The verifier rejects previews, emulators, incomplete steps, changed hashes and a different
certificate/revision/version. It validates an owner's attestation; it cannot run physical
hardware remotely. Do not publish account identifiers, recovery links or transaction screenshots.
Play-delivered testing and store declarations remain separate requirements before store rollout.

## Remaining external acceptance

| Area | Required evidence before closure |
| --- | --- |
| `main` protection | Saved rule requiring GitHub Actions `Quality gate`, current branch and PR; GitHub identity revalidation is required to save the prepared rule |
| Stable `v1.0.0` | Permanent signing, actual build identity, physical acceptance and verified release environment; RC publication alone is insufficient |
| Password recovery | Brevo/Resend verified sender and secret, delivered real email, expiry/reuse rejection and old-session revocation; 202 alone proves none of these |
| Staging/production | Confirm actual environment/secrets, migration/persistence and backup/restore evidence; a second isolated environment is not provisioned |
| Monitoring | Configured central destination/retention/owner alert route and a received test alert; provider deployment notifications are not security monitoring |
| Real-data quality | Owner-supplied independent labels and `private-real-data-v1` results; no such dataset is present in this checkout |
| Forecast changes | Representative chronological evidence before warning cutoffs, category forecasts or promoting Ridge/RF/GB challengers |
| Automatic analysis | Durable per-user jobs, deduplication, retries and a scheduler compatible with the budget; Free-service keep-alives are excluded |
| Real billing | Owner's store/provider application, products/prices, receipt/webhook verification and sandbox purchase/refund acceptance |

The evaluator, forecast baselines and subscription entitlements remain unchanged. No synthetic
dataset is relabelled as real, no financial threshold is recalibrated without labels, and no
checkout is advertised as active before a payment provider is configured.
