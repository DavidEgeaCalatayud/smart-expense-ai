"""Release safety regressions: stale checks, forged identity, and misleading ingress."""
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
import zipfile


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().parents[1] / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


source = load("release_source", "check-release-source.py")
live = load("live_backend", "check-live-backend.py")
distribution = load("android_distribution", "verify-android-distribution.py")
acceptance_gate = load("release_acceptance", "verify-release-acceptance.py")


class SourceChecks(unittest.TestCase):
    def checks(self):
        return [{"id": n, "name": name, "head_sha": "a" * 40, "app": {"slug": "github-actions"},
                 "status": "completed", "conclusion": "success"}
                for n, name in enumerate(sorted(source.REQUIRED), start=1)]

    def test_accepts_exact_source_success(self):
        self.assertEqual(set(source.require_checks(self.checks(), "a" * 40)), source.REQUIRED)

    def test_rejects_missing_wrong_source_forged_and_incomplete_checks(self):
        for mutation in ("missing", "source", "app", "failed", "pending", "skipped"):
            checks = self.checks()
            if mutation == "missing":
                checks.pop()
            elif mutation == "source":
                checks[0]["head_sha"] = "b" * 40
            elif mutation == "app":
                checks[0]["app"] = {"slug": "untrusted"}
            elif mutation == "pending":
                checks[0]["status"] = "in_progress"
            else:
                checks[0]["conclusion"] = mutation
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                source.require_checks(checks, "a" * 40)

    def test_new_failed_rerun_supersedes_old_success(self):
        checks = self.checks()
        checks.append({**checks[0], "id": 99, "conclusion": "failure"})
        with self.assertRaises(ValueError):
            source.require_checks(list(reversed(checks)), "a" * 40)


class LiveChecks(unittest.TestCase):
    headers = {"Strict-Transport-Security": "max-age=31536000", "X-Content-Type-Options": "nosniff",
               "Content-Type": "application/json"}

    def test_refuses_unsafe_url_forms(self):
        for value in ("http://example.com", "https://u:p@example.com", "https://example.com/api",
                      "https://example.com?q=token", "https://example.com#token", "https://"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                live.validate_origin(value)

    def test_protected_endpoint_requires_real_401_contract(self):
        path = "/api/v2/financial-accounts"
        result = live.inspect_response(path, 401, self.headers, b'{"error":{"code":"http_401"}}')
        self.assertEqual(result["result"], "passed")
        for status, body in ((200, b"<html>SPA fallback</html>"), (404, b"{}"), (401, b"{}")):
            with self.subTest(status=status), self.assertRaises(ValueError):
                live.inspect_response(path, status, self.headers, body)

    def test_missing_security_headers_fail(self):
        with self.assertRaises(ValueError):
            live.inspect_response("/health", 200, {}, b'{"status":"ok"}')


class DistributionChecks(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.certificate = "a1" * 32
        self.config = {"version": "1.0.0-rc.1", "android": {
            "package": "com.davidegea.smartexpenseai", "versionCode": 4}}
        self.environment = {"ANDROID_CERT_SHA256": self.certificate, "GITHUB_SHA": "a" * 40,
                            "GITHUB_RUN_ID": "123", "EXPO_PUBLIC_API_BASE_URL": "https://finance.example.test"}
        (self.root / "apk-signature.txt").write_text(
            "Signer #1 certificate SHA-256 digest: " + self.certificate + "\n")
        (self.root / "aab-certificate.txt").write_text("SHA256: " + self.certificate.upper())
        (self.root / "apk-metadata.txt").write_text(
            "package: name='com.davidegea.smartexpenseai' versionCode='4' versionName='1.0.0-rc.1'")
        (self.root / "apk-manifest.txt").write_text(
            "android:allowBackup=(type 0x12)0x0\nandroid:usesCleartextTraffic=(type 0x12)0x0\n")
        for extension, prefix in (("apk", ""), ("aab", "base/")):
            with zipfile.ZipFile(self.root / f"smart-expense-ai.{extension}", "w") as archive:
                archive.writestr(prefix + "assets/index.android.bundle", self.environment["EXPO_PUBLIC_API_BASE_URL"])
                for architecture in ("arm64-v8a", "x86_64"):
                    archive.writestr(prefix + f"lib/{architecture}/example.so", b"fixture")

    def report(self):
        return distribution.verify(self.root, self.config, self.environment)

    def acceptance(self, build):
        return {**build, "contract": "android-physical-acceptance-v1", "physicalDevice": True,
                "deviceModel": "Test device", "androidVersion": "16", "testedAt": "2026-09-26T21:00:00+00:00",
                "steps": {name: "passed" for name in acceptance_gate.REQUIRED_STEPS},
                "artifactSha256": {key: value["sha256"] for key, value in build["artifacts"].items()}}

    def test_registers_both_hashes_and_keeps_acceptance_pending(self):
        report = self.report()
        self.assertEqual(report["physicalDeviceAcceptance"], "pending")
        self.assertFalse(report["temporarySigningKey"])
        self.assertEqual(report["artifacts"]["apk"]["sha256"], hashlib.sha256((self.root / "smart-expense-ai.apk").read_bytes()).hexdigest())

    def test_rejects_different_aab_signer(self):
        (self.root / "aab-certificate.txt").write_text("SHA256: " + "b2" * 32)
        with self.assertRaises(ValueError):
            self.report()

    def test_rejects_cleartext_and_changed_version(self):
        (self.root / "apk-manifest.txt").write_text("android:allowBackup=(type 0x12)0x0\n")
        with self.assertRaises(ValueError):
            self.report()
        self.config["version"] = "2.0.0"
        with self.assertRaises(ValueError):
            self.report()

    def test_acceptance_is_bound_to_actual_bytes(self):
        build = self.report()
        acceptance = self.acceptance(build)
        self.assertEqual(acceptance_gate.verify(build, acceptance, self.root)["androidPhysicalAcceptance"], "passed")
        (self.root / "smart-expense-ai.apk").write_bytes(b"different build")
        with self.assertRaises(ValueError):
            acceptance_gate.verify(build, acceptance, self.root)

    def test_rejects_preview_emulator_wrong_build_and_incomplete_steps(self):
        for scenario in ("preview", "emulator", "source", "step"):
            build = self.report()
            acceptance = self.acceptance(build)
            if scenario == "preview":
                build["temporarySigningKey"] = True
            elif scenario == "emulator":
                acceptance["physicalDevice"] = False
            elif scenario == "source":
                acceptance["sourceSha"] = "b" * 40
            else:
                acceptance["steps"]["manualMoneyOfflineHistory"] = "pending"
            with self.subTest(scenario=scenario), self.assertRaises(ValueError):
                acceptance_gate.verify(build, acceptance, self.root)

    def test_repository_template_cannot_claim_acceptance(self):
        template = Path(__file__).resolve().parents[2] / "docs/android-physical-acceptance.template.json"
        with self.assertRaises(ValueError):
            acceptance_gate.verify(self.report(), json.loads(template.read_text()), self.root)


if __name__ == "__main__":
    unittest.main()
