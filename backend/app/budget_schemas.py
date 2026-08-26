from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class BudgetCreateRequest(BaseModel):
    month: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    categoryId: str | None = None
    limitAmount: Decimal = Field(..., gt=Decimal("0"), max_digits=12, decimal_places=2)

    @field_validator("limitAmount", mode="before")
    @classmethod
    def require_decimal_string(cls, value: object) -> object:
        if not isinstance(value, str):
            raise ValueError("limitAmount must be sent as a decimal string")
        return value


class BudgetUpdateRequest(BaseModel):
    limitAmount: Decimal = Field(..., gt=Decimal("0"), max_digits=12, decimal_places=2)

    @field_validator("limitAmount", mode="before")
    @classmethod
    def require_decimal_string(cls, value: object) -> object:
        if not isinstance(value, str):
            raise ValueError("limitAmount must be sent as a decimal string")
        return value


class BudgetDefinitionResponse(BaseModel):
    id: str
    month: str
    categoryId: str | None
    categoryName: str | None
    categoryArchived: bool
    limitAmount: str


class BudgetProgressResponse(BudgetDefinitionResponse):
    spentAmount: str
    remainingAmount: str
    percentUsed: str
    daysRemaining: int
    overBudget: bool


class BudgetMonthResponse(BaseModel):
    month: str
    totalBudget: BudgetProgressResponse | None
    categoryBudgets: list[BudgetProgressResponse]
