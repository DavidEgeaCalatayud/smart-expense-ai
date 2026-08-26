from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.category_schemas import CategoryResponse
from app.models.category import Category
from app.models.transaction import Transaction as TransactionModel
from app.schemas import TransactionType


class CategoryInputError(ValueError):
    pass


class CategoryConflictError(RuntimeError):
    pass


def _parse_uuid(value: str) -> UUID | None:
    try:
        return UUID(value)
    except ValueError:
        return None


def _normalized_name(value: str) -> str:
    name = " ".join(value.split())
    if not name:
        raise CategoryInputError("Category name must not be empty")
    return name


def _visible_clause(user_id: UUID):
    return or_(Category.owner_user_id.is_(None), Category.owner_user_id == user_id)


def get_active_visible_category(
    db: Session,
    user_id: UUID,
    name: str,
    transaction_type: TransactionType,
) -> Category | None:
    normalized = _normalized_name(name)
    return db.scalar(
        select(Category).where(
            _visible_clause(user_id),
            Category.archived.is_(False),
            Category.transaction_type == transaction_type.value,
            func.lower(Category.name) == normalized.lower(),
        )
    )


def get_active_visible_category_by_id(
    db: Session,
    user_id: UUID,
    category_id: str,
) -> Category | None:
    parsed = _parse_uuid(category_id)
    if parsed is None:
        return None
    return db.scalar(
        select(Category).where(
            Category.id == parsed,
            _visible_clause(user_id),
            Category.archived.is_(False),
        )
    )


def build_active_category_lookup(
    db: Session,
    user_id: UUID,
) -> dict[tuple[str, str], Category]:
    categories = db.scalars(
        select(Category).where(
            _visible_clause(user_id),
            Category.archived.is_(False),
        )
    ).all()
    return {(category.name.lower(), category.transaction_type): category for category in categories}


def _transaction_counts(db: Session, user_id: UUID) -> dict[UUID, int]:
    rows = db.execute(
        select(TransactionModel.category_id, func.count(TransactionModel.id))
        .where(TransactionModel.user_id == user_id)
        .group_by(TransactionModel.category_id)
    ).all()
    return {row[0]: int(row[1]) for row in rows}


def _response(category: Category, count: int) -> CategoryResponse:
    return CategoryResponse(
        id=str(category.id),
        name=category.name,
        transactionType=TransactionType(category.transaction_type),
        scope="system" if category.owner_user_id is None else "user",
        archived=category.archived,
        transactionCount=count,
    )


def list_categories(
    db: Session,
    user_id: UUID,
    *,
    include_archived: bool = False,
) -> list[CategoryResponse]:
    conditions = [_visible_clause(user_id)]
    if not include_archived:
        conditions.append(Category.archived.is_(False))
    categories = db.scalars(
        select(Category)
        .where(*conditions)
        .order_by(Category.transaction_type, Category.name, Category.id)
    ).all()
    counts = _transaction_counts(db, user_id)
    return [_response(category, counts.get(category.id, 0)) for category in categories]


def _visible_name_conflict(
    db: Session,
    user_id: UUID,
    name: str,
    transaction_type: str,
    *,
    exclude_id: UUID | None = None,
) -> bool:
    conditions = [
        _visible_clause(user_id),
        func.lower(Category.name) == name.lower(),
        Category.transaction_type == transaction_type,
    ]
    if exclude_id is not None:
        conditions.append(Category.id != exclude_id)
    return db.scalar(select(Category.id).where(*conditions).limit(1)) is not None


def create_category(
    db: Session,
    user_id: UUID,
    name: str,
    transaction_type: TransactionType,
) -> CategoryResponse:
    normalized = _normalized_name(name)
    if _visible_name_conflict(db, user_id, normalized, transaction_type.value):
        raise CategoryConflictError(
            f"A visible {transaction_type.value} category named {normalized} already exists"
        )
    category = Category(
        owner_user_id=user_id,
        name=normalized,
        transaction_type=transaction_type.value,
        system_category=False,
        archived=False,
    )
    db.add(category)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise CategoryConflictError("Category already exists") from exc
    db.refresh(category)
    return _response(category, 0)


def _owned_category(db: Session, user_id: UUID, category_id: str) -> Category | None:
    parsed = _parse_uuid(category_id)
    if parsed is None:
        return None
    return db.scalar(
        select(Category).where(
            Category.id == parsed,
            Category.owner_user_id == user_id,
            Category.system_category.is_(False),
        )
    )


def rename_category(
    db: Session,
    user_id: UUID,
    category_id: str,
    name: str,
) -> CategoryResponse | None:
    category = _owned_category(db, user_id, category_id)
    if category is None:
        return None
    normalized = _normalized_name(name)
    if _visible_name_conflict(
        db,
        user_id,
        normalized,
        category.transaction_type,
        exclude_id=category.id,
    ):
        raise CategoryConflictError(f"A visible category named {normalized} already exists")
    category.name = normalized
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise CategoryConflictError("Category already exists") from exc
    count = db.scalar(
        select(func.count(TransactionModel.id)).where(
            TransactionModel.user_id == user_id,
            TransactionModel.category_id == category.id,
        )
    ) or 0
    return _response(category, int(count))


def archive_category(
    db: Session,
    user_id: UUID,
    category_id: str,
    *,
    mode: str,
    reassign_to_category_id: str | None = None,
) -> CategoryResponse | None:
    category = _owned_category(db, user_id, category_id)
    if category is None:
        return None
    if category.archived:
        raise CategoryInputError("Category is already archived")

    if mode == "reassign":
        if not reassign_to_category_id:
            raise CategoryInputError("A reassignment target is required")
        target = get_active_visible_category_by_id(db, user_id, reassign_to_category_id)
        if target is None:
            raise CategoryInputError("Reassignment target is not available")
        if target.id == category.id:
            raise CategoryInputError("A category cannot be reassigned to itself")
        if target.transaction_type != category.transaction_type:
            raise CategoryInputError("Reassignment target must use the same transaction type")
        db.execute(
            update(TransactionModel)
            .where(
                TransactionModel.user_id == user_id,
                TransactionModel.category_id == category.id,
            )
            .values(category_id=target.id)
        )
    elif mode != "archive":
        raise CategoryInputError("Unsupported archive mode")

    category.archived = True
    db.commit()
    return _response(category, 0 if mode == "reassign" else _transaction_counts(db, user_id).get(category.id, 0))


def restore_category(
    db: Session,
    user_id: UUID,
    category_id: str,
) -> CategoryResponse | None:
    category = _owned_category(db, user_id, category_id)
    if category is None:
        return None
    if not category.archived:
        raise CategoryInputError("Category is not archived")
    if _visible_name_conflict(
        db,
        user_id,
        category.name,
        category.transaction_type,
        exclude_id=category.id,
    ):
        raise CategoryConflictError(
            "Category cannot be restored because its name is already in use"
        )
    category.archived = False
    db.commit()
    return _response(category, _transaction_counts(db, user_id).get(category.id, 0))
