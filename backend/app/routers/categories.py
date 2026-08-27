from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.category_schemas import (
    CategoryArchiveRequest,
    CategoryCreateRequest,
    CategoryResponse,
    CategoryUpdateRequest,
)
from app.core.api_errors import ApiError
from app.db.session import get_db
from app.models.user import User
from app.services.category_service import (
    CategoryConflictError,
    CategoryInputError,
    archive_category,
    create_category,
    list_visible_categories,
    rename_category,
    restore_category,
)

router = APIRouter(prefix="/categories", tags=["categories"])


def _not_found() -> ApiError:
    return ApiError(status.HTTP_404_NOT_FOUND, "category_not_found", "Category not found")


def _raise_category_error(exc: Exception) -> None:
    if isinstance(exc, CategoryConflictError):
        raise ApiError(status.HTTP_409_CONFLICT, "category_conflict", str(exc)) from exc
    raise ApiError(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        "invalid_category",
        str(exc),
    ) from exc


@router.get("", response_model=list[CategoryResponse])
def get_categories(
    include_archived: bool = Query(False, alias="includeArchived"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CategoryResponse]:
    return list_visible_categories(db, current_user.id, include_archived=include_archived)


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def post_category(
    payload: CategoryCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategoryResponse:
    try:
        return create_category(db, current_user.id, payload.name, payload.transactionType)
    except (CategoryConflictError, CategoryInputError) as exc:
        _raise_category_error(exc)
        raise AssertionError("unreachable")


@router.patch("/{category_id}", response_model=CategoryResponse)
def patch_category(
    category_id: str,
    payload: CategoryUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategoryResponse:
    try:
        category = rename_category(db, current_user.id, category_id, payload.name)
    except (CategoryConflictError, CategoryInputError) as exc:
        _raise_category_error(exc)
        raise AssertionError("unreachable")
    if category is None:
        raise _not_found()
    return category


@router.post("/{category_id}/archive", response_model=CategoryResponse)
def post_archive_category(
    category_id: str,
    payload: CategoryArchiveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategoryResponse:
    try:
        category = archive_category(
            db,
            current_user.id,
            category_id,
            mode=payload.mode,
            reassign_to_category_id=payload.reassignToCategoryId,
        )
    except (CategoryConflictError, CategoryInputError) as exc:
        _raise_category_error(exc)
        raise AssertionError("unreachable")
    if category is None:
        raise _not_found()
    return category


@router.post("/{category_id}/restore", response_model=CategoryResponse)
def post_restore_category(
    category_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategoryResponse:
    try:
        category = restore_category(db, current_user.id, category_id)
    except (CategoryConflictError, CategoryInputError) as exc:
        _raise_category_error(exc)
        raise AssertionError("unreachable")
    if category is None:
        raise _not_found()
    return category
