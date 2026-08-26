from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas import PaymentMethod, TransactionType


DateFormat = Literal["auto", "yyyy-mm-dd", "dd/mm/yyyy", "mm/dd/yyyy", "dd-mm-yyyy"]
DecimalSeparator = Literal["auto", "dot", "comma"]
AmountConvention = Literal["negative_expense", "positive_expense", "explicit_type"]


class CsvDetectRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=1, max_length=2_000_000)


class CsvColumnMapping(BaseModel):
    date: str = Field(..., min_length=1, max_length=120)
    amount: str = Field(..., min_length=1, max_length=120)
    merchant: str = Field(..., min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=120)
    category: str | None = Field(default=None, max_length=120)
    type: str | None = Field(default=None, max_length=120)
    currency: str | None = Field(default=None, max_length=120)
    paymentMethod: str | None = Field(default=None, max_length=120)


class CsvImportOptions(BaseModel):
    dateFormat: DateFormat = "auto"
    decimalSeparator: DecimalSeparator = "auto"
    amountConvention: AmountConvention = "negative_expense"
    defaultType: TransactionType = TransactionType.expense
    defaultPaymentMethod: PaymentMethod = PaymentMethod.bank_transfer


class CsvImportRequest(CsvDetectRequest):
    mapping: CsvColumnMapping
    options: CsvImportOptions = Field(default_factory=CsvImportOptions)


class CsvDetectResponse(BaseModel):
    fileHash: str
    delimiter: str
    headers: list[str]
    suggestedMapping: dict[str, str | None]
    sampleRows: list[dict[str, str]]


class CsvNormalizedTransaction(BaseModel):
    date: str
    merchant: str
    description: str
    amount: str
    currency: str
    category: str
    type: TransactionType
    paymentMethod: PaymentMethod
    fingerprint: str


class CsvPreviewRow(BaseModel):
    rowNumber: int
    status: Literal["valid", "duplicate", "invalid"]
    transaction: CsvNormalizedTransaction | None = None
    errors: list[str] = Field(default_factory=list)


class CsvPreviewResponse(BaseModel):
    fileHash: str
    delimiter: str
    headers: list[str]
    rowsTotal: int
    validRows: int
    duplicateRows: int
    invalidRows: int
    previewRows: list[CsvPreviewRow]
    previewTruncated: bool


class ImportBatchResponse(BaseModel):
    id: str
    filename: str
    fileHash: str
    rowsTotal: int
    rowsImported: int
    duplicatesSkipped: int
    invalidRows: int
    createdAt: datetime


class CsvCommitResponse(BaseModel):
    batch: ImportBatchResponse
    importedCount: int
    duplicatesSkipped: int


class ImportBatchPage(BaseModel):
    items: list[ImportBatchResponse]
    total: int
