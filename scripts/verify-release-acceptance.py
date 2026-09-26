"""Verify owner-recorded physical acceptance is bound to the actual permanent artifacts."""
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re


REQUIRED_STEPS = {
    "launchWithoutMetro", "httpsLoginAndSync", "offlineForceStopAndReopen", "reconnectWithoutDuplicates",
    "conflictResolution", "cachedWorkspaceLabels", "backgroundThenForegroundSync", "accountIsolation",
    "sessionRevocation", "sameKeyUpgradePreservesOutbox", "accountDeletion", "biometricLock",
    "notificationsAndWidget", "csvImport", "manualMoneyOfflineHistory",
}


def verify(build, acceptance, directory):
    if build.get("contract") != "android-distribution-build-v1" or build.get("temporarySigningKey") is not False:
        raise ValueError("Only permanent distribution builds can close V1")
    if acceptance.get("contract") != "android-physical-acceptance-v1" or acceptance.get("physicalDevice") is not True:
        raise ValueError("Physical-device acceptance is required; emulator evidence is insufficient")
    for field in ("sourceSha", "workflowRun", "package", "version", "versionCode", "apiBaseUrl", "signerCertificateSha256"):
        if not build.get(field) or acceptance.get(field) != build[field]:
            raise ValueError(f"Acceptance does not identify the exact build: {field}")
    if not re.fullmatch(r"[0-9a-f]{40}", build["sourceSha"]):
        raise ValueError("Missing exact source revision")
    if not acceptance.get("deviceModel") or not acceptance.get("androidVersion"):
        raise ValueError("Device model and Android version are required")
    stamp = datetime.fromisoformat(acceptance.get("testedAt", ""))
    if stamp.tzinfo is None:
        raise ValueError("Acceptance timestamp must have a timezone")
    steps = acceptance.get("steps", {})
    if any(steps.get(step) != "passed" for step in REQUIRED_STEPS):
        raise ValueError("Every physical acceptance step must pass")
    for kind in ("apk", "aab"):
        artifact = build.get("artifacts", {}).get(kind, {})
        filename = f"smart-expense-ai.{kind}"
        if artifact.get("file") != filename:
            raise ValueError("Unexpected artifact filename")
        digest = hashlib.sha256((directory / filename).read_bytes()).hexdigest()
        if artifact.get("sha256") != digest or acceptance.get("artifactSha256", {}).get(kind) != digest:
            raise ValueError(f"{kind}: artifact hash differs from accepted bytes")
    return {"androidPhysicalAcceptance": "passed", "sourceSha": build["sourceSha"],
            "scope": "Owner-attested device acceptance; not evidence of Play publication, mail delivery or ML accuracy"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--acceptance", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(verify(json.loads((args.artifacts / "build-info.json").read_text()),
                            json.loads(args.acceptance.read_text()), args.artifacts), indent=2))
