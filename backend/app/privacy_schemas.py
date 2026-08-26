from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas import PrivacyExportResponse


class PrivacyExportImportBatch(BaseModel):
    id: str
    filename: str
    fileHash: str
    rowsTotal: int
    rowsImported: int
    duplicatesSkipped: int
    invalidRows: int
    createdAt: datetime


class PrivacyExportResponseWithImports(PrivacyExportResponse):
    importBatches: list[PrivacyExportImportBatch] = Field(default_factory=list)
