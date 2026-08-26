from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import FeatureUnion, Pipeline

from app.analysis_contracts import (
    CATEGORY_CLASSIFIER_FEATURE_POLICY,
    CATEGORY_CLASSIFIER_VERSION,
)


MODEL_VERSION = CATEGORY_CLASSIFIER_VERSION
FEATURE_POLICY = CATEGORY_CLASSIFIER_FEATURE_POLICY
RANDOM_STATE = 20260826


@dataclass(frozen=True)
class CategoryPrediction:
    category: str
    confidence: float
    probabilities: dict[str, float]


class CategoryClassifier:
    """Reusable TF-IDF + Logistic Regression merchant-text classifier.

    This class intentionally consumes only merchant/descriptor text. Amount, date,
    scenario identifiers and category metadata are excluded so the benchmark cannot
    leak the target through non-text features.
    """

    def __init__(self) -> None:
        word = TfidfVectorizer(
            analyzer="word",
            lowercase=True,
            strip_accents="unicode",
            ngram_range=(1, 2),
            sublinear_tf=True,
            min_df=1,
        )
        char = TfidfVectorizer(
            analyzer="char_wb",
            lowercase=True,
            strip_accents="unicode",
            ngram_range=(3, 5),
            sublinear_tf=True,
            min_df=1,
        )
        features = FeatureUnion(
            [
                ("word_tfidf", word),
                ("char_tfidf", char),
            ]
        )
        classifier = LogisticRegression(
            solver="lbfgs",
            max_iter=1000,
            class_weight="balanced",
            random_state=RANDOM_STATE,
        )
        self.pipeline: Pipeline = Pipeline(
            [
                ("features", features),
                ("classifier", classifier),
            ]
        )
        self._fitted = False

    def fit(self, merchants: Sequence[str], categories: Sequence[str]) -> "CategoryClassifier":
        if len(merchants) != len(categories):
            raise ValueError("merchants and categories must have the same length")
        if len(merchants) < 2:
            raise ValueError("at least two labelled examples are required")
        if len(set(categories)) < 2:
            raise ValueError("at least two categories are required")
        self.pipeline.fit(list(merchants), list(categories))
        self._fitted = True
        return self

    @property
    def classes_(self) -> list[str]:
        self._require_fitted()
        classifier: LogisticRegression = self.pipeline.named_steps["classifier"]
        return [str(value) for value in classifier.classes_]

    def predict(self, merchants: Iterable[str]) -> list[str]:
        self._require_fitted()
        return [str(value) for value in self.pipeline.predict(list(merchants))]

    def predict_with_probabilities(self, merchants: Iterable[str]) -> list[CategoryPrediction]:
        self._require_fitted()
        values = list(merchants)
        predicted = self.pipeline.predict(values)
        probability_rows = self.pipeline.predict_proba(values)
        classes = self.classes_
        results: list[CategoryPrediction] = []
        for category, row in zip(predicted, probability_rows, strict=True):
            probabilities = {
                label: float(probability)
                for label, probability in zip(classes, row, strict=True)
            }
            results.append(
                CategoryPrediction(
                    category=str(category),
                    confidence=max(probabilities.values()),
                    probabilities=probabilities,
                )
            )
        return results

    def _require_fitted(self) -> None:
        if not self._fitted:
            raise RuntimeError("category classifier must be fitted before prediction")


__all__ = [
    "CategoryClassifier",
    "CategoryPrediction",
    "FEATURE_POLICY",
    "MODEL_VERSION",
    "RANDOM_STATE",
]
