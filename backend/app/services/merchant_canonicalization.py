from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher
import re
import unicodedata


REFERENCE_TOKEN = re.compile(r"^(?=.*\d)[a-z0-9]{4,}$")
NON_ALNUM = re.compile(r"[^a-z0-9]+")

LEGAL_SUFFIXES = {
    "sa",
    "sl",
    "slu",
    "sarl",
    "ltd",
    "limited",
    "inc",
    "llc",
    "plc",
    "gmbh",
    "bv",
    "eu",
    "es",
}

NOISE_TOKENS = {
    "pos",
    "purchase",
    "payment",
    "card",
    "debit",
    "credit",
    "mktp",
    "marketplace",
    "com",
    "bill",
    "billing",
}

KNOWN_ALIASES: tuple[tuple[set[str], str], ...] = (
    ({"amazon", "amzn"}, "amazon"),
    ({"spotify"}, "spotify"),
    ({"netflix"}, "netflix"),
    ({"youtube"}, "youtube"),
    ({"disneyplus", "disney"}, "disney plus"),
    ({"microsoft", "msft"}, "microsoft"),
    ({"apple"}, "apple"),
)


@dataclass(frozen=True)
class MerchantIdentity:
    raw: str
    normalized: str
    canonical: str
    strategy: str


def _ascii_lower(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(
        character for character in normalized if not unicodedata.combining(character)
    ).lower()


def _tokens(value: str) -> list[str]:
    return [token for token in NON_ALNUM.sub(" ", _ascii_lower(value)).split() if token]


def _clean_tokens(value: str) -> list[str]:
    tokens = _tokens(value)
    cleaned = [
        token
        for token in tokens
        if token not in LEGAL_SUFFIXES
        and token not in NOISE_TOKENS
        and not REFERENCE_TOKEN.match(token)
        and not token.isdigit()
    ]
    if cleaned and cleaned[0] in {"paypal", "sumup", "square", "sq"} and len(cleaned) > 1:
        cleaned = cleaned[1:]
    if not cleaned:
        cleaned = [token for token in tokens if not token.isdigit()]
    return cleaned


def _base_label(value: str) -> tuple[str, str]:
    tokens = _tokens(value)
    token_set = set(tokens)

    for aliases, canonical in KNOWN_ALIASES:
        if token_set & aliases:
            return canonical, "known_alias"

    cleaned = _clean_tokens(value)
    label = " ".join(cleaned).strip()
    if not label:
        label = NON_ALNUM.sub(" ", _ascii_lower(value)).strip()
    return label, "token_cleanup"


def merchant_stream_hint(value: str, canonical: str) -> str:
    """Return descriptor tokens that may distinguish streams inside one canonical merchant.

    The canonical merchant identity is intentionally removed so descriptors such as
    ``Apple iCloud`` and ``Apple Music`` retain ``icloud``/``music`` while banking
    references, legal suffixes and generic payment noise are discarded. The raw merchant
    value remains authoritative and is never replaced by this hint.
    """

    canonical_tokens = set(_tokens(canonical))
    alias_tokens: set[str] = set()
    for aliases, alias_canonical in KNOWN_ALIASES:
        if alias_canonical == canonical:
            alias_tokens.update(aliases)

    descriptor = [
        token
        for token in _clean_tokens(value)
        if token not in canonical_tokens and token not in alias_tokens
    ]
    return " ".join(descriptor[:4])


def _token_similarity(first: str, second: str) -> float:
    first_tokens = set(first.split())
    second_tokens = set(second.split())
    if not first_tokens or not second_tokens:
        return 0.0
    union = first_tokens | second_tokens
    return len(first_tokens & second_tokens) / len(union)


def _similar_enough(first: str, second: str) -> bool:
    if first == second:
        return True
    character_ratio = SequenceMatcher(None, first, second).ratio()
    token_ratio = _token_similarity(first, second)
    return character_ratio >= 0.90 or (
        token_ratio >= 0.80 and min(len(first), len(second)) >= 5
    )


def build_merchant_identity_map(values: list[str]) -> dict[str, MerchantIdentity]:
    """Return a deterministic raw->canonical mapping while preserving audit metadata.

    The pipeline first performs Unicode/case normalization, strips banking references and
    legal/noise tokens, resolves a small explicit alias vocabulary, then clusters only
    highly-similar cleaned labels. Raw merchant text is never discarded from the result.
    """

    base: dict[str, tuple[str, str]] = {}
    for value in sorted(set(values), key=lambda item: item.casefold()):
        label, strategy = _base_label(value)
        base[value] = (label, strategy)

    canonical_labels: list[str] = []
    resolved: dict[str, MerchantIdentity] = {}

    for raw in sorted(base, key=lambda item: (base[item][0], item.casefold())):
        label, strategy = base[raw]
        canonical = label
        fuzzy_match = next(
            (candidate for candidate in canonical_labels if _similar_enough(label, candidate)),
            None,
        )
        if fuzzy_match is not None:
            canonical = fuzzy_match
            if canonical != label:
                strategy = "fuzzy_cluster"
        else:
            canonical_labels.append(label)

        resolved[raw] = MerchantIdentity(
            raw=raw,
            normalized=NON_ALNUM.sub(" ", _ascii_lower(raw)).strip(),
            canonical=canonical,
            strategy=strategy,
        )

    return resolved
