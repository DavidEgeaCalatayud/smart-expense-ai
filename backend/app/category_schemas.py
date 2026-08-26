from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas import TransactionType


class CategoryResponse(BaseModel):
    id: str
    name: str
    transactionType: TransactionType
    scope: Literal["system", "user"]
    archived: bool
    transactionCount: int


class CategoryCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    transactionType: TransactionType


class CategoryUpdateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


class CategoryArchiveRequest(BaseModel):
    mode: Literal["archive", "reassign"]
    reassignToCategoryId: str | None = None

    @model_validator(mode="after")
    def validate_reassignment(self) -> "CategoryArchiveRequest":
        if self.mode == "reassign" and not self.reassignToCategoryId:
            raise ValueError("reassignToCategoryId is required when mode is reassign")
        return self
