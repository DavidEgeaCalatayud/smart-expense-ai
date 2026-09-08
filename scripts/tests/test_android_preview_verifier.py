"""Regression cases from actual apksigner output; no signing secrets required."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


VERIFIER = Path(__file__).resolve().parents[1] / 'verify-android-preview.py'
CERTIFICATE = 'a1' * 32


class AndroidPreviewVerifierTests(unittest.TestCase):
    def verify_fixture(self, signature):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / 'dist/android-preview'
            output.mkdir(parents=True)
            with zipfile.ZipFile(output / 'smart-expense-ai-preview.apk', 'w') as apk:
                apk.writestr('assets/index.android.bundle', 'https://smart-expense-free.onrender.com')
                apk.writestr('lib/arm64-v8a/example.so', b'fixture')
                apk.writestr('lib/x86_64/example.so', b'fixture')
            (output / 'apk-metadata.txt').write_text(
                "package: name='com.davidegea.smartexpenseai.preview' versionCode='1' versionName='0.2.0'\n"
            )
            (output / 'signature.txt').write_text(signature)
            manifest = root / 'manifest.txt'
            manifest.write_text(
                'A: android:allowBackup(0x01010280)=(type 0x12)0x0\n'
                'A: android:usesCleartextTraffic(0x010104ec)=(type 0x12)0x0\n'
            )
            result = subprocess.run(
                [sys.executable, str(VERIFIER)], cwd=root, capture_output=True, text=True,
                env={**os.environ, 'PREVIEW_MANIFEST_PATH': str(manifest),
                     'PREVIEW_CERT_SHA256': CERTIFICATE, 'GITHUB_SHA': 'fixture',
                     'GITHUB_RUN_ID': 'fixture'},
                check=False,
            )
            info = output / 'build-info.json'
            return result, json.loads(info.read_text()) if info.exists() else None

    def test_accepts_verified_signer_output_formats(self):
        for label in ('Signer #1', 'Signer (minSdkVersion=28, maxSdkVersion=32)', 'V3.0 Signer:'):
            with self.subTest(label=label):
                result, info = self.verify_fixture(
                    f'Verifies\nNumber of signers: 1\n{label} certificate SHA-256 digest: {CERTIFICATE}\n'
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(info['signerCertificateSha256'], CERTIFICATE)

    def test_rejects_another_certificate_even_when_expected_public_key_is_present(self):
        result, info = self.verify_fixture(
            f'V3.0 Signer: certificate SHA-256 digest: {"b2" * 32}\n'
            f'V3.0 Signer: public key SHA-256 digest: {CERTIFICATE}\n'
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(info)

    def test_does_not_accept_source_stamp_as_application_signer(self):
        result, info = self.verify_fixture(f'Source Stamp Signer certificate SHA-256 digest: {CERTIFICATE}\n')
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(info)


if __name__ == '__main__':
    unittest.main()
