# Software supply-chain controls

Smart Expense AI treats dependency vulnerability auditing and software bills of materials (SBOMs) as complementary controls. An SBOM is an inventory, not a vulnerability scan and not proof that a dependency or image is safe.

## Current dependency controls

The repository currently uses:

- exact frontend dependency resolution through `frontend/package-lock.json` and `npm ci`;
- pinned direct backend runtime dependencies in `backend/requirements.txt`;
- weekly Dependabot updates for pip, npm and GitHub Actions;
- immutable commit SHAs for GitHub Actions used by CI;
- `pip-audit` against backend runtime requirements as a blocking quality gate;
- `npm audit --audit-level=high` against the installed frontend dependency tree as a blocking quality gate;
- CycloneDX dependency SBOM generation for backend and frontend on pull requests and pushes to `main`.

## SBOM workflow

`.github/workflows/sbom.yml` produces two CycloneDX 1.6 JSON documents:

- `backend.cdx.json` — generated from an isolated Python runtime environment installed from `backend/requirements.txt`; this captures the runtime packages actually resolved and installed for that environment without mixing in the SBOM generator itself;
- `frontend.cdx.json` — generated after `npm ci` from the frontend project and its locked npm dependency tree.

Both documents are generated with reproducible-output mode, validated by the CycloneDX tooling, checked again by CI for the expected format/specification and non-empty component inventory, and uploaded together as the `dependency-sboms` GitHub Actions artifact. The artifact is retained for 14 days.

The SBOM generator versions are pinned in the workflow so an unrelated tooling release cannot silently change the generated contract.

## What these SBOMs cover

The dependency SBOMs provide a machine-readable inventory of the application dependency environments reconstructed by CI from the repository's dependency manifests/lock data. They are useful for dependency inventory, incident response, downstream vulnerability correlation and release evidence.

The backend SBOM represents the Python application runtime dependency environment. The frontend SBOM represents the npm project dependency tree installed by CI, including development/build dependencies present in the locked project environment.

## What these SBOMs do not cover

The current SBOM workflow does **not** inventory the final Docker/OCI image filesystem, base-image operating-system packages, Nginx image packages, PostgreSQL image packages or deployment-host packages. Container-image vulnerability scanning and image-level SBOM/provenance remain separate production-readiness work.

The SBOMs also do not replace:

- `pip-audit` or `npm audit`;
- container image scanning;
- signed build provenance/attestations;
- deployment artifact signing;
- runtime monitoring or incident response.

A green SBOM workflow means that dependency inventories were generated and validated successfully. It does not mean that no vulnerabilities exist.

## Merge expectation

For changes that affect dependencies or the supply-chain workflow, a merge candidate should keep all of the following green:

```text
Dependency security audit     PASS
Supply chain SBOM             PASS
Backend tests                 PASS
Frontend quality              PASS
Critical E2E                  PASS
Docker Compose smoke          PASS
Quality gate                  PASS
```

Analytical benchmark workflows remain independent regression gates for changes that could affect financial-intelligence behavior.
