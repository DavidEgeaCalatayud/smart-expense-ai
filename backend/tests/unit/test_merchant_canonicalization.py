from app.services.merchant_canonicalization import (
    build_merchant_identity_map,
    merchant_stream_hint,
)


def test_amazon_bank_descriptors_collapse_to_one_canonical_merchant() -> None:
    raw_values = [
        "AMZN Mktp ES*84HG2",
        "Amazon EU SARL",
        "AMAZON*123456",
        "Amazon.es",
    ]

    identities = build_merchant_identity_map(raw_values)

    assert {identity.canonical for identity in identities.values()} == {"amazon"}
    assert {identity.raw for identity in identities.values()} == set(raw_values)
    assert all(identity.normalized for identity in identities.values())


def test_reference_tokens_and_legal_suffixes_do_not_split_same_merchant() -> None:
    identities = build_merchant_identity_map(
        [
            "Stream Box SL",
            "STREAM BOX*3003",
            "Stream Box",
        ]
    )

    assert {identity.canonical for identity in identities.values()} == {"stream box"}
    assert identities["STREAM BOX*3003"].strategy in {"token_cleanup", "fuzzy_cluster"}


def test_raw_merchant_is_preserved_even_when_fuzzy_clustered() -> None:
    identities = build_merchant_identity_map(["Coffee Corner", "Coffee Corners"])

    assert len({identity.canonical for identity in identities.values()}) == 1
    assert identities["Coffee Corner"].raw == "Coffee Corner"
    assert identities["Coffee Corners"].raw == "Coffee Corners"


def test_stream_hint_keeps_product_descriptor_after_canonical_identity_is_removed() -> None:
    identities = build_merchant_identity_map(["Apple iCloud", "Apple Music", "APPLE.COM/BILL"])

    assert {identity.canonical for identity in identities.values()} == {"apple"}
    assert merchant_stream_hint("Apple iCloud", "apple") == "icloud"
    assert merchant_stream_hint("Apple Music", "apple") == "music"
    assert merchant_stream_hint("APPLE.COM/BILL", "apple") == ""
