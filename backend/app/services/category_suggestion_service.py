from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.category_suggestion_schemas import CategorySuggestionPreviewResponse
from app.models.category import Category
from app.models.category_suggestion import CategorySuggestion
from app.models.transaction import Transaction
from app.schemas import TransactionType
from app.services.category_service import get_active_visible_category_by_id
from app.services.merchant_canonicalization import build_merchant_identity_map
from ml.category_runtime import FEATURE_POLICY, MODEL_VERSION, rank_categories


PERSONALIZATION_VERSION = "user-merchant-history-v1"
PERSONALIZATION_FEATURE_POLICY = "canonical_merchant_feedback_v1"


@dataclass(frozen=True)
class SuggestionCandidate:
    category: Category
    merchant_key: str
    source: str
    model_version: str
    feature_policy: str


def _merchant_key(merchant: str) -> str:
    normalized = " ".join(merchant.split())
    if not normalized:
        raise ValueError("Merchant must not be empty")
    identity = build_merchant_identity_map([normalized])[normalized]
    return identity.canonical or identity.normalized


def _history_candidate(
    db: Session,
    user_id: UUID,
    merchant_key: str,
    transaction_type: TransactionType,
    *,
    exclude_transaction_id: UUID | None = None,
) -> SuggestionCandidate | None:
    conditions = [
        CategorySuggestion.user_id == user_id,
        CategorySuggestion.merchant_key == merchant_key,
        CategorySuggestion.transaction_type == transaction_type.value,
        CategorySuggestion.selected_category_id.is_not(None),
    ]
    if exclude_transaction_id is not None:
        conditions.append(CategorySuggestion.transaction_id != exclude_transaction_id)

    decisions = db.scalars(
        select(CategorySuggestion)
        .where(*conditions)
        .order_by(CategorySuggestion.updated_at.desc(), CategorySuggestion.created_at.desc())
        .limit(10)
    ).all()
    for decision in decisions:
        if decision.selected_category_id is None:
            continue
        category = get_active_visible_category_by_id(
            db, user_id, str(decision.selected_category_id)
        )
        if category is None or category.transaction_type != transaction_type.value:
            continue
        return SuggestionCandidate(
            category=category,
            merchant_key=merchant_key,
            source="user_history",
            model_version=PERSONALIZATION_VERSION,
            feature_policy=PERSONALIZATION_FEATURE_POLICY,
        )
    return None


def _global_candidate(
    db: Session,
    merchant: str,
    merchant_key: str,
    transaction_type: TransactionType,
) -> SuggestionCandidate | None:
    categories = db.scalars(
        select(Category).where(
            Category.system_category.is_(True),
            Category.archived.is_(False),
            Category.transaction_type == transaction_type.value,
        )
    ).all()
    by_name = {category.name: category for category in categories}
    ranked = rank_categories(merchant, by_name)
    if not ranked:
        return None
    return SuggestionCandidate(
        category=by_name[ranked[0]],
        merchant_key=merchant_key,
        source="global_model",
        model_version=MODEL_VERSION,
        feature_policy=FEATURE_POLICY,
    )


def build_category_suggestion(
    db: Session,
    user_id: UUID,
    merchant: str,
    transaction_type: TransactionType,
    *,
    exclude_transaction_id: UUID | None = None,
) -> SuggestionCandidate | None:
    merchant_key = _merchant_key(merchant)
    personalized = _history_candidate(
        db,
        user_id,
        merchant_key,
        transaction_type,
        exclude_transaction_id=exclude_transaction_id,
    )
    if personalized is not None:
        return personalized
    return _global_candidate(db, merchant, merchant_key, transaction_type)


def preview_category_suggestion(
    db: Session,
    user_id: UUID,
    merchant: str,
    transaction_type: TransactionType,
) -> CategorySuggestionPreviewResponse | None:
    candidate = build_category_suggestion(db, user_id, merchant, transaction_type)
    if candidate is None:
        return None
    return CategorySuggestionPreviewResponse(
        categoryId=str(candidate.category.id),
        categoryName=candidate.category.name,
        source=candidate.source,  # type: ignore[arg-type]
        modelVersion=candidate.model_version,
        featurePolicy=candidate.feature_policy,
    )


def record_category_feedback(
    db: Session,
    user_id: UUID,
    transaction: Transaction,
    candidate: SuggestionCandidate | None,
    selected_category: Category,
) -> None:
    if candidate is None:
        return

    feedback = db.scalar(
        select(CategorySuggestion).where(
            CategorySuggestion.transaction_id == transaction.id,
            CategorySuggestion.user_id == user_id,
        )
    )
    accepted = selected_category.id == candidate.category.id
    corrected_at = None if accepted else datetime.now(timezone.utc)

    if feedback is None:
        feedback = CategorySuggestion(
            user_id=user_id,
            transaction_id=transaction.id,
            merchant_key=candidate.merchant_key,
            transaction_type=transaction.transaction_type,
            source=candidate.source,
            model_version=candidate.model_version,
            feature_policy=candidate.feature_policy,
            suggested_category_id=candidate.category.id,
            selected_category_id=selected_category.id,
            accepted=accepted,
            corrected_at=corrected_at,
        )
        db.add(feedback)
        return

    feedback.merchant_key = candidate.merchant_key
    feedback.transaction_type = transaction.transaction_type
    feedback.source = candidate.source
    feedback.model_version = candidate.model_version
    feedback.feature_policy = candidate.feature_policy
    feedback.suggested_category_id = candidate.category.id
    feedback.selected_category_id = selected_category.id
    feedback.accepted = accepted
    feedback.corrected_at = corrected_at
