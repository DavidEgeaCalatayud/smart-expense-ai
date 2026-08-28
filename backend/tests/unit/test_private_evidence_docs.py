from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]


def _read(relative_path: str) -> str:
    return (REPO_ROOT / relative_path).read_text(encoding="utf-8")


def test_private_real_data_evidence_documentation_stays_aligned() -> None:
    docs = _read("docs/private-evaluation.md")
    private_readme = _read("data/private/README.md")
    roadmap = _read("ROADMAP.md")

    for value in (
        "private-real-data-evidence-v1",
        "category_feedback.jsonl",
        "unseenMerchantF1",
        "acceptanceRate",
        "correctionRate",
        "falsePositivesPer100Transactions",
        "occurrencePrecision",
        "occurrenceRecall",
        "dateMaeDays",
        "amountMae",
        "--require-real-evidence",
        "--require-final-holdout-evidence",
    ):
        assert value in docs

    assert "Acceptance/correction is a product-behavior metric" in docs
    assert "must not be derived from classifier correctness" in docs
    assert "sourceType=synthetic_test" in docs
    assert "sourceType=synthetic_test" in private_readme
    assert "private-real-data-evidence-v1" in roadmap

    # The mechanism is complete, but an actual independently-labelled private run is not.
    assert (
        "- [ ] Run `private-real-data-v1` against a genuinely independent/private labelled "
        "transaction dataset"
    ) in roadmap
    assert (
        "- [x] Add `private-real-data-evidence-v1`" in roadmap
    )
