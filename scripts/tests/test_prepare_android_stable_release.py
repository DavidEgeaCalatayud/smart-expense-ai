"""Regression tests for fail-closed stable Android release preparation."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


def load(name: str, filename: str):
    path = Path(__file__).resolve().parents[1] / filename
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


stable = load("android_stable_release", "prepare-android-stable-release.py")
acceptance_verifier = load("android_acceptance_for_stable_tests", "verify-release-acceptance.py")


class StableAndroidReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.artifacts = self.root / "artifacts"
        self.artifacts.mkdir()
        self.output = self.root / "public-release"
        self.acceptance_path = self.root / "private-acceptance.json"

        (self.artifacts / "smart-expense-ai.apk").write_bytes(b"accepted permanent apk")
        (self.artifacts / "smart-expense-ai.aab").write_bytes(b"accepted permanent aab")
        apk_hash = hashlib.sha256((self.artifacts / "smart-expense-ai.apk").read_bytes()).hexdigest()
        aab_hash = hashlib.sha256((self.artifacts / "smart-expense-ai.aab").read_bytes()).hexdigest()

        self.build = {
            "contract": "android-distribution-build-v1",
            "sourceSha": "a" * 40,
            "workflowRun": "12345",
            "package": "com.davidegea.smartexpenseai",
            "version": "1.0.0",
            "versionCode": 5,
            "apiBaseUrl": "https://smart-expense-free.onrender.com",
            "signerCertificateSha256": "c" * 64,
            "temporarySigningKey": False,
            "artifacts": {
                "apk": {"file": "smart-expense-ai.apk", "sha256": apk_hash},
                "aab": {"file": "smart-expense-ai.aab", "sha256": aab_hash},
            },
            "physicalDeviceAcceptance": "pending",
            "playAcceptance": "pending",
        }
        (self.artifacts / "build-info.json").write_text(json.dumps(self.build))

        self.acceptance = {
            "contract": "android-physical-acceptance-v1",
            "physicalDevice": True,
            "sourceSha": self.build["sourceSha"],
            "workflowRun": self.build["workflowRun"],
            "package": self.build["package"],
            "version": self.build["version"],
            "versionCode": self.build["versionCode"],
            "apiBaseUrl": self.build["apiBaseUrl"],
            "signerCertificateSha256": self.build["signerCertificateSha256"],
            "artifactSha256": {"apk": apk_hash, "aab": aab_hash},
            "deviceModel": "Physical acceptance fixture",
            "androidVersion": "16",
            "testedAt": "2026-09-29T10:00:00+02:00",
            "steps": {name: "passed" for name in acceptance_verifier.REQUIRED_STEPS},
        }
        self.acceptance_path.write_text(json.dumps(self.acceptance))

    def rewrite_build(self):
        (self.artifacts / "build-info.json").write_text(json.dumps(self.build))

    def test_prepares_public_bundle_only_from_exact_accepted_stable_bytes(self):
        proof = stable.prepare(self.artifacts, self.acceptance_path, self.output, "v1.0.0")

        self.assertEqual(proof["contract"], "android-stable-release-proof-v1")
        self.assertEqual(proof["tag"], "v1.0.0")
        self.assertEqual(proof["sourceSha"], "a" * 40)
        self.assertEqual(proof["androidPhysicalAcceptance"], "passed")
        self.assertTrue((self.output / "smart-expense-ai.apk").exists())
        self.assertTrue((self.output / "smart-expense-ai.aab").exists())
        self.assertTrue((self.output / "build-info.json").exists())
        self.assertTrue((self.output / "acceptance-proof.json").exists())
        self.assertTrue((self.output / "SHA256SUMS").exists())
        self.assertTrue((self.output / "RELEASE_NOTES.md").exists())
        self.assertFalse((self.output / self.acceptance_path.name).exists())
        public_proof = json.loads((self.output / "acceptance-proof.json").read_text())
        self.assertNotIn("deviceModel", public_proof)
        self.assertNotIn("steps", public_proof)
        self.assertEqual(public_proof["acceptanceEvidenceSha256"], hashlib.sha256(self.acceptance_path.read_bytes()).hexdigest())

    def test_rejects_release_candidate_or_mismatched_stable_tag(self):
        with self.assertRaises(ValueError):
            stable.prepare(self.artifacts, self.acceptance_path, self.output, "v1.0.0-rc.1")

        self.build["version"] = "1.0.0-rc.1"
        self.rewrite_build()
        self.acceptance["version"] = "1.0.0-rc.1"
        self.acceptance_path.write_text(json.dumps(self.acceptance))
        with self.assertRaises(ValueError):
            stable.prepare(self.artifacts, self.acceptance_path, self.output, "v1.0.0")

        self.build["version"] = "1.0.0"
        self.rewrite_build()
        self.acceptance["version"] = "1.0.0"
        self.acceptance_path.write_text(json.dumps(self.acceptance))
        with self.assertRaises(ValueError):
            stable.prepare(self.artifacts, self.acceptance_path, self.output, "v1.0.1")

    def test_rejects_changed_bytes_and_nonempty_output(self):
        (self.artifacts / "smart-expense-ai.apk").write_bytes(b"tampered after acceptance")
        with self.assertRaises(ValueError):
            stable.prepare(self.artifacts, self.acceptance_path, self.output, "v1.0.0")

        (self.artifacts / "smart-expense-ai.apk").write_bytes(b"accepted permanent apk")
        self.output.mkdir()
        (self.output / "unrelated.txt").write_text("do not overwrite")
        with self.assertRaises(ValueError):
            stable.prepare(self.artifacts, self.acceptance_path, self.output, "v1.0.0")

    def test_rejects_temporary_signing_identity(self):
        self.build["temporarySigningKey"] = True
        self.rewrite_build()
        with self.assertRaises(ValueError):
            stable.prepare(self.artifacts, self.acceptance_path, self.output, "v1.0.0")


if __name__ == "__main__":
    unittest.main()
