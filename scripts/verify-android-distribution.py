"""Inspect both signed artifacts and record public build identity; not device acceptance."""
import hashlib
import json
import os
from pathlib import Path
import re
import zipfile


def verify(destination, config, environment):
    certificate = environment["ANDROID_CERT_SHA256"].lower().replace(":", "")
    api = environment["EXPO_PUBLIC_API_BASE_URL"].rstrip("/")
    package = config["android"]["package"]
    if package != "com.davidegea.smartexpenseai":
        raise ValueError("Official build must use the permanent package")
    signature = (destination / "apk-signature.txt").read_text()
    digests = {value.lower().replace(":", "") for value in re.findall(
        r"^(?:V\d+(?:\.\d+)*\s+)?Signer[^\n]* certificate SHA-256 digest:\s*([0-9a-fA-F:]+)\s*$",
        signature, re.MULTILINE)}
    aab_certificate = (destination / "aab-certificate.txt").read_text()
    aab_digests = {value.lower().replace(":", "") for value in re.findall(r"SHA256:\s*([0-9A-Fa-f:]+)", aab_certificate)}
    if not re.fullmatch(r"[0-9a-f]{64}", certificate) or digests != {certificate} or aab_digests != {certificate}:
        raise ValueError("APK/AAB must both match the registered permanent certificate")
    if "Android Debug" in signature or "Android Debug" in aab_certificate or "One-off Preview" in signature:
        raise ValueError("Development or temporary signing identity is not distributable")
    metadata = (destination / "apk-metadata.txt").read_text()
    for required in (f"package: name='{package}'", f"versionName='{config['version']}'",
                     f"versionCode='{config['android']['versionCode']}'"):
        if required not in metadata:
            raise ValueError("APK package/version differs from the reviewed configuration")
    manifest = (destination / "apk-manifest.txt").read_text()
    for attribute in ("allowBackup", "usesCleartextTraffic"):
        if not re.search(rf"android:{attribute}\b[^\n]*=\(type 0x12\)0x0\b", manifest):
            raise ValueError(f"APK must disable {attribute}")
    if re.search(r"android:debuggable\b[^\n]*=\(type 0x12\)(?!0x0\b)", manifest):
        raise ValueError("APK must not be debuggable")
    artifacts = {}
    for extension, prefix in (("apk", ""), ("aab", "base/")):
        artifact = destination / f"smart-expense-ai.{extension}"
        with zipfile.ZipFile(artifact) as archive:
            bundle = archive.read(prefix + "assets/index.android.bundle")
            if api.encode() not in bundle or b"https://api.example.invalid" in bundle:
                raise ValueError(f"{extension}: live API missing or fixture API bundled")
            for architecture in ("arm64-v8a", "x86_64"):
                if not any(name.startswith(prefix + f"lib/{architecture}/") for name in archive.namelist()):
                    raise ValueError(f"{extension}: missing native architecture {architecture}")
        artifacts[extension] = {"file": artifact.name, "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest()}
    return {"contract": "android-distribution-build-v1", "sourceSha": environment["GITHUB_SHA"],
            "workflowRun": environment["GITHUB_RUN_ID"], "package": package, "version": config["version"],
            "versionCode": config["android"]["versionCode"], "apiBaseUrl": api,
            "signerCertificateSha256": certificate, "temporarySigningKey": False,
            "artifacts": artifacts, "physicalDeviceAcceptance": "pending", "playAcceptance": "pending"}


if __name__ == "__main__":
    output = Path("dist/android-distribution")
    info = verify(output, json.loads(Path("mobile/app.json").read_text())["expo"], os.environ)
    (output / "build-info.json").write_text(json.dumps(info, indent=2) + "\n")
    print(json.dumps(info, indent=2))
