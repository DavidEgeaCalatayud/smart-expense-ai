from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.schemas import MoneyString


class ReportCategoryBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: str
    type: Literal["expense", "income"]
    total: MoneyString
    transactionCount: int


class MonthlyReportResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reportVersion: Literal["monthly-financial-report-v1"]
    month: str
    currency: Literal["EUR"]
    totalIncome: MoneyString
    totalExpenses: MoneyString
    net: MoneyString
    transactionCount: int
    categoryBreakdown: list[ReportCategoryBreakdown]
    downloadFilename: str
