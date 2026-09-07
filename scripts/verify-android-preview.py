"""Validate the actual signed standalone APK before it is offered for download."""
import hashlib
import json
import os
import re
import zipfile
from pathlib import Path

destination = Path('dist/android-preview')
apk = destination / 'smart-expense-ai-preview.apk'
metadata = (destination / 'apk-metadata.txt').read_text()
manifest = Path(os.environ['PREVIEW_MANIFEST_PATH']).read_text()
signature = (destination / 'signature.txt').read_text()
package = 'com.davidegea.smartexpenseai.preview'
api = 'https://smart-expense-free.onrender.com'

if f"package: name='{package}'" not in metadata:
    raise SystemExit('APK must use the isolated preview package')
for attribute in ('allowBackup', 'usesCleartextTraffic'):
    if not re.search(rf'android:{attribute}\b[^\n]*=\(type 0x12\)0x0\b', manifest):
        raise SystemExit(f'APK must disable {attribute}')
if re.search(r'android:debuggable\b[^\n]*=\(type 0x12\)(?!0x0\b)', manifest):
    raise SystemExit('APK must not be debuggable')
certificate = os.environ['PREVIEW_CERT_SHA256'].lower()
if f'Signer #1 certificate SHA-256 digest: {certificate}' not in signature:
    raise SystemExit('APK signature differs from the generated preview certificate')
if 'Android Debug' in signature:
    raise SystemExit('Do not distribute an APK with the default debug certificate')

with zipfile.ZipFile(apk) as archive:
    bundle = archive.read('assets/index.android.bundle')
    if api.encode() not in bundle:
        raise SystemExit('Bundled JavaScript is missing the live HTTPS API')
    # The emulator address also appears in a legitimate configuration-error
    # message, so its mere presence does not identify the configured endpoint.
    if b'https://api.example.invalid' in bundle:
        raise SystemExit('Bundled JavaScript contains a fixture API')
    names = archive.namelist()
    for architecture in ('arm64-v8a', 'x86_64'):
        if not any(name.startswith(f'lib/{architecture}/') for name in names):
            raise SystemExit(f'APK is missing {architecture} native libraries')

version = re.search(r"versionName='([^']+)'", metadata)
version_code = re.search(r"versionCode='([^']+)'", metadata)
info = {
    'kind': 'one-off Android preview; not a Google Play release',
    'package': package,
    'version': version.group(1) if version else None,
    'versionCode': version_code.group(1) if version_code else None,
    'sourceSha': os.environ['GITHUB_SHA'],
    'workflowRun': os.environ['GITHUB_RUN_ID'],
    'apiBaseUrl': api,
    'apkSha256': hashlib.sha256(apk.read_bytes()).hexdigest(),
    'signerCertificateSha256': certificate,
    'bundledJavaScript': True,
    'debuggable': False,
    'temporarySigningKey': True,
    'upgradeNotice': 'Future one-off previews require reinstalling. Sync pending data first.',
}
(destination / 'build-info.json').write_text(json.dumps(info, indent=2) + '\n')
print(json.dumps(info, indent=2))
