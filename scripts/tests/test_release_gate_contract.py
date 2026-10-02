"""Regression guard for the complete exact-source Android release certification."""
import importlib.util
from pathlib import Path
import unittest


def load_release_source():
    path = Path(__file__).resolve().parents[1] / "check-release-source.py"
    spec = importlib.util.spec_from_file_location("release_source_gate_contract", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


EXPECTED_RELEASE_GATES = {
    "Quality gate",
    "Mobile quality",
    "Android emulator E2E",
    "Image security (backend)",
    "Image security (frontend)",
    "Image security (postgres)",
    "Image security (render-free)",
    "Backend and frontend CycloneDX SBOMs",
    "Labelled benchmark integrity",
    "Cancel-reactivate development diagnostic",
    "TF-IDF category classification",
    "Deterministic forecast benchmark",
    "IsolationForest causal benchmark",
}


class ReleaseGateContractTests(unittest.TestCase):
    def test_permanent_android_distribution_requires_complete_certification(self):
        source = load_release_source()
        self.assertEqual(source.REQUIRED, EXPECTED_RELEASE_GATES)

    def test_contract_covers_every_release_evidence_family(self):
        source = load_release_source()
        required = source.REQUIRED
        self.assertIn("Quality gate", required)
        self.assertIn("Mobile quality", required)
        self.assertIn("Android emulator E2E", required)
        self.assertEqual(len([name for name in required if name.startswith("Image security (")]), 4)
        self.assertIn("Backend and frontend CycloneDX SBOMs", required)
        self.assertIn("Labelled benchmark integrity", required)
        self.assertIn("Cancel-reactivate development diagnostic", required)
        self.assertIn("TF-IDF category classification", required)
        self.assertIn("Deterministic forecast benchmark", required)
        self.assertIn("IsolationForest causal benchmark", required)


if __name__ == "__main__":
    unittest.main()
