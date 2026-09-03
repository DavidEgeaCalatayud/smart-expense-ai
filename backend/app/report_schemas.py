from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ReportCategoryBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: str
    type: Literal["expense", "income"]
    total: Decimal
    transactionCount: int


class MonthlyReportResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reportVersion: Literal["monthly-financial-report-v1"]
    month: str
    currency: Literal["EUR"]
    totalIncome: Decimal
    totalExpenses: Decimal
    net: Decimal
    transactionCount: int
    categoryBreakdown: list[ReportCategoryBreakdown]
    downloadFilename: str
