from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.category_suggestion_schemas import (
    CategorySuggestionPreviewRequest,
    CategorySuggestionPreviewResponse,
)
from app.core.api_errors import ApiError
from app.db.session import get_db
from app.models.user import User
from app.services.category_suggestion_service import preview_category_suggestion


router = APIRouter(prefix="/category-suggestions", tags=["category-suggestions-v2"])


@router.post("/preview", response_model=CategorySuggestionPreviewResponse)
def preview_suggestion(
    payload: CategorySuggestionPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategorySuggestionPreviewResponse:
    suggestion = preview_category_suggestion(db, current_user.id, payload.merchant, payload.type)
    if suggestion is None:
        raise ApiError(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "category_suggestion_unavailable",
            "No compatible category suggestion is available",
        )
    return suggestion
