from typing import Literal

from pydantic import BaseModel, Field

from app.schemas import TransactionType


class CategorySuggestionPreviewRequest(BaseModel):
    merchant: str = Field(..., min_length=1, max_length=120)
    type: TransactionType


class CategorySuggestionPreviewResponse(BaseModel):
    categoryId: str
    categoryName: str
    source: Literal["user_history", "global_model"]
    modelVersion: str
    featurePolicy: str
