"""Prepare a public stable Android release bundle from physically accepted permanent artifacts."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil


STABLE_TAG = re.compile(r"v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")
STABLE_VERSION = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")
OFFICIAL_PACKAGE = "com.davidegea.smartexpenseai"


def _load_acceptance_verifier():
    path = Path(__file__).resolve().with_name("verify-release-acceptance.py")
    spec = importlib.util.spec_from_file_location("android_release_acceptance", path)
    module = importlib.util.module_from_spec(spec)
    if spec.loader is None:
        raise RuntimeError("Unable to load physical acceptance verifier")
    spec.loader.exec_module(module)
    return module


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(artifacts: Path, acceptance_path: Path, output: Path, tag: str) -> dict:
    if not STABLE_TAG.fullmatch(tag):
        raise ValueError("Stable publication requires a non-prerelease semantic tag such as v1.0.0")

    build_path = artifacts / "build-info.json"
    build = json.loads(build_path.read_text())
    acceptance_bytes = acceptance_path.read_bytes()
    acceptance = json.loads(acceptance_bytes)

    # Re-run the exact-byte physical acceptance verifier instead of trusting a copied status field.
    verifier = _load_acceptance_verifier()
    verifier.verify(build, acceptance, artifacts)

    version = build.get("version")
    if version != tag[1:] or not STABLE_VERSION.fullmatch(str(version)):
        raise ValueError("Stable tag must exactly match a stable build version; RC/pre-release builds cannot be promoted")
    if build.get("package") != OFFICIAL_PACKAGE:
        raise ValueError("Stable Android release must use the permanent application package")
    if build.get("temporarySigningKey") is not False:
        raise ValueError("Stable Android release requires the permanent signing identity")

    apk = artifacts / "smart-expense-ai.apk"
    aab = artifacts / "smart-expense-ai.aab"
    apk_hash = _sha256(apk)
    aab_hash = _sha256(aab)

    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError("Stable release output path must be an empty directory")
    output.mkdir(parents=True, exist_ok=True)
    shutil.copy2(apk, output / apk.name)
    shutil.copy2(aab, output / aab.name)
    shutil.copy2(build_path, output / build_path.name)

    (output / "SHA256SUMS").write_text(
        f"{apk_hash}  {apk.name}\n{aab_hash}  {aab.name}\n"
    )

    # Deliberately publish only a sanitized proof. The raw acceptance record may contain device
    # details and should remain in the owner's private release evidence store.
    proof = {
        "contract": "android-stable-release-proof-v1",
        "tag": tag,
        "sourceSha": build["sourceSha"],
        "package": build["package"],
        "version": version,
        "versionCode": build["versionCode"],
        "apiBaseUrl": build["apiBaseUrl"],
        "signerCertificateSha256": build["signerCertificateSha256"],
        "artifacts": {
            "apk": {"file": apk.name, "sha256": apk_hash},
            "aab": {"file": aab.name, "sha256": aab_hash},
        },
        "androidPhysicalAcceptance": "passed",
        "acceptanceEvidenceSha256": hashlib.sha256(acceptance_bytes).hexdigest(),
        "acceptanceContract": acceptance.get("contract"),
        "testedAt": acceptance.get("testedAt"),
        "scope": "Exact permanent-signed bytes passed owner-attested physical-device acceptance; Play publication, real-mail delivery and independent ML accuracy remain separate evidence.",
    }
    (output / "acceptance-proof.json").write_text(json.dumps(proof, indent=2) + "\n")
    (output / "RELEASE_NOTES.md").write_text(
        f"# Smart Expense AI {tag}\n\n"
        "Stable Android build prepared from the exact permanent-signed APK/AAB that passed the repository's physical-device acceptance contract.\n\n"
        "Public evidence: `build-info.json`, `acceptance-proof.json` and `SHA256SUMS`. The private/raw acceptance record remains with the owner.\n"
    )
    return proof


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts", type=Path, required=True)
    parser.add_argument("--acceptance", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tag", required=True)
    args = parser.parse_args()
    print(json.dumps(prepare(args.artifacts, args.acceptance, args.output, args.tag), indent=2))
