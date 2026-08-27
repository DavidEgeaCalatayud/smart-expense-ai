from __future__ import annotations

from functools import lru_cache
from typing import Iterable

from ml.category_classifier import FEATURE_POLICY, MODEL_VERSION, CategoryClassifier


# Production bootstrap corpus. It is intentionally small, explicit and merchant-text-only.
# It is not presented as real user training data and is kept separate from benchmark fixtures.
_RUNTIME_EXAMPLES: tuple[tuple[str, str], ...] = (
    ("Mercadona", "Food"), ("Mercadona supermercado", "Food"),
    ("Carrefour", "Food"), ("Carrefour Market", "Food"),
    ("Lidl", "Food"), ("Aldi", "Food"), ("Dia supermercado", "Food"),
    ("Alcampo", "Food"), ("Consum", "Food"), ("Supermercado", "Food"),
    ("Panaderia", "Food"), ("Restaurante", "Food"), ("Cafe", "Food"),
    ("Uber", "Transport"), ("Uber Trip", "Transport"), ("Cabify", "Transport"),
    ("Renfe", "Transport"), ("Metro", "Transport"), ("Autobus", "Transport"),
    ("Repsol", "Transport"), ("Cepsa", "Transport"), ("BP gas station", "Transport"),
    ("Parking", "Transport"), ("Taxi", "Transport"),
    ("Amazon", "Shopping"), ("Amazon marketplace", "Shopping"),
    ("Zara", "Shopping"), ("H&M", "Shopping"), ("Ikea", "Shopping"),
    ("Apple Store", "Shopping"), ("Media Markt", "Shopping"),
    ("El Corte Ingles", "Shopping"), ("Fnac", "Shopping"), ("Book Store", "Shopping"),
    ("Farmacia", "Health"), ("Pharmacy", "Health"), ("Clinica dental", "Health"),
    ("Dentista", "Health"), ("Optica", "Health"), ("Hospital", "Health"),
    ("Fisioterapia", "Health"), ("Parafarmacia", "Health"),
    ("Netflix", "Subscriptions"), ("Spotify", "Subscriptions"),
    ("Disney Plus", "Subscriptions"), ("HBO Max", "Subscriptions"),
    ("Microsoft 365", "Subscriptions"), ("Apple iCloud", "Subscriptions"),
    ("YouTube Premium", "Subscriptions"), ("Adobe Creative Cloud", "Subscriptions"),
    ("Gym membership", "Subscriptions"),
    ("Nomina", "Salary"), ("Payroll", "Salary"), ("Employer Payroll", "Salary"),
    ("Salary payment", "Salary"), ("Sueldo empresa", "Salary"),
    ("Cinema", "Other"), ("Pet Shop", "Other"), ("Lavanderia", "Other"),
    ("Ferreteria", "Other"), ("Gift Shop", "Other"), ("Lottery", "Other"),
    ("Public administration fee", "Other"), ("Unknown merchant", "Other"),
)


def runtime_training_examples() -> tuple[tuple[str, str], ...]:
    """Return the immutable production bootstrap corpus for evaluation slicing.

    Private/independent evaluation uses this only to distinguish descriptors already represented
    in the runtime bootstrap from naturally unseen merchant keys. It never mutates or retrains
    the production classifier with evaluation data.
    """

    return _RUNTIME_EXAMPLES


@lru_cache(maxsize=1)
def get_runtime_classifier() -> CategoryClassifier:
    merchants = [merchant for merchant, _ in _RUNTIME_EXAMPLES]
    categories = [category for _, category in _RUNTIME_EXAMPLES]
    return CategoryClassifier().fit(merchants, categories)


def rank_categories(merchant: str, allowed_categories: Iterable[str]) -> list[str]:
    allowed = set(allowed_categories)
    if not allowed:
        return []
    prediction = get_runtime_classifier().predict_with_probabilities([merchant])[0]
    return [
        category
        for category, _ in sorted(
            prediction.probabilities.items(), key=lambda item: (-item[1], item[0])
        )
        if category in allowed
    ]


__all__ = [
    "FEATURE_POLICY",
    "MODEL_VERSION",
    "get_runtime_classifier",
    "rank_categories",
    "runtime_training_examples",
]
