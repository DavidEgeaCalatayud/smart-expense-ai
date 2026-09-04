# Software supply-chain controls

Smart Expense AI treats dependency vulnerability auditing, container-image vulnerability scanning, software bills of materials (SBOMs) and build provenance as complementary controls. An SBOM is an inventory, not a vulnerability scan and not proof that a dependency or image is safe.

## Current dependency controls

The repository currently uses:

- exact frontend dependency resolution through `frontend/package-lock.json` and `npm ci`;
- pinned direct backend runtime dependencies in `backend/requirements.txt`;
- weekly Dependabot updates for pip, npm and GitHub Actions;
- immutable commit SHAs for GitHub Actions used by CI;
- `pip-audit` against backend runtime requirements as a blocking quality gate;
- `npm audit --audit-level=high` against the installed frontend dependency tree as a blocking quality gate;
- CycloneDX dependency SBOM generation for backend and frontend on pull requests and pushes to `main`.

## Dependency SBOM workflow

`.github/workflows/sbom.yml` produces two CycloneDX 1.6 JSON documents:

- `backend.cdx.json` — generated from an isolated Python runtime environment installed from `backend/requirements.txt`; this captures the runtime packages actually resolved and installed for that environment without mixing in the SBOM generator itself;
- `frontend.cdx.json` — generated after `npm ci` from the frontend project and its locked npm dependency tree.

Both documents are generated with reproducible-output mode, validated by the CycloneDX tooling, checked again by CI for the expected format/specification and non-empty component inventory, and uploaded together as the `dependency-sboms` GitHub Actions artifact. The artifact is retained for 14 days.

The SBOM generator versions are pinned in the workflow so an unrelated tooling release cannot silently change the generated contract.

## Container image security workflow

`.github/workflows/container-security.yml` builds the final backend, frontend and hardened PostgreSQL runtime images from a fresh base pull and evaluates the actual image filesystem rather than only dependency manifests.

For each image the workflow:

- builds with BuildKit and captures `max` provenance metadata plus the resolved image digest;
- runs Trivy v0.70.0 against operating-system and language-library packages;
- records HIGH/CRITICAL vulnerability findings without ignoring vulnerabilities that do not yet have an upstream fix;
- generates a full-image CycloneDX SBOM;
- validates that the provenance contains a build type and source materials, that the image SBOM contains components and that the final image contains zero HIGH/CRITICAL findings;
- retains the provenance, vulnerability report and image SBOM as per-image GitHub Actions artifacts for 14 days.

The Trivy action and the existing checkout/upload actions are pinned to immutable commit SHAs. A vulnerability report is generated before the blocking assertion so failed candidates still retain evidence for diagnosis.

The production-like runtimes are deliberately hardened to make the strict gate achievable without vulnerability allowlists: the backend compiles `scikit-learn` in a disposable Alpine builder and copies only the virtual environment into an Alpine runtime; the frontend uses an updated Nginx/Alpine runtime; and PostgreSQL is rebuilt from the current Alpine image with security upgrades while replacing the vulnerable `gosu` privilege-transition binary with `su-exec` in the official entrypoint scripts.

## What the SBOMs cover

The dependency SBOMs provide a machine-readable inventory of the application dependency environments reconstructed by CI from the repository's dependency manifests/lock data. They are useful for dependency inventory, incident response, downstream vulnerability correlation and release evidence.

The backend dependency SBOM represents the Python application runtime dependency environment. The frontend dependency SBOM represents the npm project dependency tree installed by CI, including development/build dependencies present in the locked project environment.

The container-image SBOMs complement those inventories by covering the final backend, frontend and PostgreSQL image filesystems, including base-image operating-system packages and runtime libraries. Their associated BuildKit metadata records the image digest and build materials used by the candidate build.

## Remaining supply-chain boundary

These controls do **not** inventory or secure deployment-host packages, cloud control-plane configuration, TLS/domain configuration, external registries or runtime infrastructure. They also do not provide cryptographic artifact signing or a production deployment attestation chain.

The SBOM and vulnerability controls do not replace:

- `pip-audit` or `npm audit`;
- deployment artifact signing;
- registry admission policy;
- runtime monitoring or incident response;
- production secrets, TLS and host hardening.

A green dependency SBOM workflow means that dependency inventories were generated and validated successfully. A green container-image security workflow additionally means that the three built runtime images carried valid image-level inventory/provenance evidence and contained no HIGH/CRITICAL findings according to the pinned Trivy database/tooling used by that run; it is not a permanent guarantee that future vulnerability intelligence will remain unchanged.

## Merge expectation

For changes that affect dependencies, images or the supply-chain workflow, a merge candidate should keep all of the following green:

```text
Dependency security audit     PASS
Supply chain SBOM             PASS
Container image security      PASS
Backend tests                 PASS
Frontend quality              PASS
Critical E2E                  PASS
Docker Compose smoke          PASS
Quality gate                  PASS
```

Analytical benchmark workflows remain independent regression gates for changes that could affect financial-intelligence behavior.
