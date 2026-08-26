from __future__ import annotations

import csv
import hashlib
import io
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.import_schemas import (
    CsvCommitResponse,
    CsvDetectRequest,
    CsvDetectResponse,
    CsvImportRequest,
    CsvNormalizedTransaction,
    CsvPreviewResponse,
    CsvPreviewRow,
    ImportBatchPage,
    ImportBatchResponse,
)
from app.models.category import Category
from app.models.import_batch import ImportBatch
from app.models.transaction import Transaction as TransactionModel
from app.schemas import PaymentMethod, TransactionType
from app.services.category_service import build_active_category_lookup


MAX_IMPORT_ROWS = 10_000
PREVIEW_ROW_LIMIT = 100
MONEY_CENT = Decimal("0.01")


class CsvImportError(ValueError):
    def __init__(self, message: str, *, details: object | None = None) -> None:
        super().__init__(message)
        self.details = details


class CsvImportConflictError(RuntimeError):
    pass


@dataclass(frozen=True)
class _ParsedCsv:
    delimiter: str
    headers: list[str]
    rows: list[dict[str, str]]


@dataclass(frozen=True)
class _PreparedRow:
    row_number: int
    transaction: CsvNormalizedTransaction
    category_id: UUID


@dataclass(frozen=True)
class _PreparedImport:
    parsed: _ParsedCsv
    file_hash: str
    preview_rows: list[CsvPreviewRow]
    rows_to_import: list[_PreparedRow]
    duplicate_rows: int
    invalid_rows: int


HEADER_ALIASES: dict[str, tuple[str, ...]] = {
    "date": (
        "date",
        "fecha",
        "transactiondate",
        "bookingdate",
        "valuedate",
        "fechavalor",
        "fechaoperacion",
    ),
    "amount": ("amount", "importe", "monto", "valor", "quantity"),
    "merchant": (
        "merchant",
        "comercio",
        "concepto",
        "payee",
        "beneficiario",
        "contraparte",
    ),
    "description": (
        "description",
        "descripcion",
        "detalle",
        "reference",
        "referencia",
        "memo",
    ),
    "category": ("category", "categoria"),
    "type": ("type", "tipo", "transactiontype", "movementtype", "naturaleza"),
    "currency": ("currency", "moneda", "divisa"),
    "paymentMethod": ("paymentmethod", "metodopago", "medio", "payment"),
}

TYPE_ALIASES = {
    "expense": TransactionType.expense,
    "gasto": TransactionType.expense,
    "debit": TransactionType.expense,
    "debito": TransactionType.expense,
    "cargo": TransactionType.expense,
    "income": TransactionType.income,
    "ingreso": TransactionType.income,
    "credit": TransactionType.income,
    "credito": TransactionType.income,
    "abono": TransactionType.income,
}

PAYMENT_METHOD_ALIASES = {
    "card": PaymentMethod.card,
    "tarjeta": PaymentMethod.card,
    "cash": PaymentMethod.cash,
    "efectivo": PaymentMethod.cash,
    "banktransfer": PaymentMethod.bank_transfer,
    "transfer": PaymentMethod.bank_transfer,
    "transferencia": PaymentMethod.bank_transfer,
    "directdebit": PaymentMethod.direct_debit,
    "domiciliacion": PaymentMethod.direct_debit,
    "recibo": PaymentMethod.direct_debit,
}

DATE_FORMATS = {
    "yyyy-mm-dd": "%Y-%m-%d",
    "dd/mm/yyyy": "%d/%m/%Y",
    "mm/dd/yyyy": "%m/%d/%Y",
    "dd-mm-yyyy": "%d-%m-%Y",
}


def _file_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _normalized_token(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "", ascii_value.lower())


def _normalized_fingerprint_text(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(re.findall(r"[a-z0-9]+", ascii_value.lower()))


def _transaction_fingerprint(
    transaction_date: date,
    amount: Decimal,
    merchant: str,
    description: str,
    transaction_type: TransactionType,
    currency: str,
) -> str:
    payload = "|".join(
        (
            transaction_date.isoformat(),
            f"{amount.quantize(MONEY_CENT):.2f}",
            transaction_type.value,
            currency,
            _normalized_fingerprint_text(merchant),
            _normalized_fingerprint_text(description),
        )
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _detect_delimiter(content: str) -> str:
    sample = content[:16_384]
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        counts = {delimiter: sample.count(delimiter) for delimiter in (";", ",", "\t", "|")}
        delimiter, count = max(counts.items(), key=lambda item: item[1])
        if count == 0:
            raise CsvImportError("Unable to detect a CSV delimiter")
        return delimiter


def _parse_csv(content: str) -> _ParsedCsv:
    clean_content = content.lstrip("\ufeff")
    delimiter = _detect_delimiter(clean_content)
    reader = csv.DictReader(io.StringIO(clean_content), delimiter=delimiter)
    if reader.fieldnames is None:
        raise CsvImportError("CSV must contain a header row")

    headers = [header.strip() for header in reader.fieldnames]
    if any(not header for header in headers):
        raise CsvImportError("CSV contains an empty column name")
    if len(set(headers)) != len(headers):
        raise CsvImportError("CSV column names must be unique")

    rows: list[dict[str, str]] = []
    for raw_row in reader:
        row = {
            header: str(raw_row.get(original_header) or "").strip()
            for header, original_header in zip(headers, reader.fieldnames, strict=True)
        }
        if not any(row.values()):
            continue
        rows.append(row)
        if len(rows) > MAX_IMPORT_ROWS:
            raise CsvImportError(f"CSV imports are limited to {MAX_IMPORT_ROWS} data rows")

    if not rows:
        raise CsvImportError("CSV contains no data rows")
    return _ParsedCsv(delimiter=delimiter, headers=headers, rows=rows)


def _suggest_mapping(headers: list[str]) -> dict[str, str | None]:
    normalized_headers = {header: _normalized_token(header) for header in headers}
    suggestions: dict[str, str | None] = {}
    for target, aliases in HEADER_ALIASES.items():
        match = next(
            (
                header
                for header, normalized in normalized_headers.items()
                if normalized in aliases
            ),
            None,
        )
        suggestions[target] = match
    return suggestions


def detect_csv(payload: CsvDetectRequest) -> CsvDetectResponse:
    parsed = _parse_csv(payload.content)
    return CsvDetectResponse(
        fileHash=_file_hash(payload.content),
        delimiter=parsed.delimiter,
        headers=parsed.headers,
        suggestedMapping=_suggest_mapping(parsed.headers),
        sampleRows=parsed.rows[:5],
    )


def _validate_mapping(payload: CsvImportRequest, headers: list[str]) -> None:
    mapping_values = payload.mapping.model_dump()
    missing = [
        target
        for target in ("date", "amount", "merchant")
        if mapping_values[target] not in headers
    ]
    unknown = [
        {"field": target, "column": column}
        for target, column in mapping_values.items()
        if column is not None and column not in headers
    ]
    if missing or unknown:
        raise CsvImportError(
            "CSV mapping references missing columns",
            details={"requiredMissing": missing, "unknownMappings": unknown},
        )
    if payload.options.amountConvention == "explicit_type" and payload.mapping.type is None:
        raise CsvImportError(
            "explicit_type amount convention requires a mapped transaction type column"
        )


def _parse_date(value: str, date_format: str) -> date:
    value = value.strip()
    if not value:
        raise ValueError("date is empty")

    formats = (
        [DATE_FORMATS[date_format]]
        if date_format != "auto"
        else ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"]
    )
    for pattern in formats:
        try:
            return datetime.strptime(value, pattern).date()
        except ValueError:
            continue
    if date_format == "auto":
        raise ValueError(
            "unsupported or ambiguous date; choose an explicit date format when needed"
        )
    raise ValueError(f"date does not match configured format {date_format}")


def _normalize_numeric_text(value: str, decimal_separator: str) -> tuple[str, bool]:
    text = value.strip().replace("\u00a0", "").replace(" ", "")
    if not text:
        raise ValueError("amount is empty")

    parenthesized = text.startswith("(") and text.endswith(")")
    if parenthesized:
        text = text[1:-1]
    negative = parenthesized or text.startswith("-")
    text = text.lstrip("+-")
    text = re.sub(r"[A-Za-z€$£]", "", text)
    text = text.replace("'", "")
    if not re.fullmatch(r"\d[\d.,]*", text):
        raise ValueError("amount contains unsupported characters")

    separator = decimal_separator
    if separator == "auto":
        if "," in text and "." in text:
            separator = "comma" if text.rfind(",") > text.rfind(".") else "dot"
        elif "," in text:
            last_fraction = text.rsplit(",", 1)[1]
            separator = "comma" if len(last_fraction) <= 2 else "dot"
        elif "." in text:
            last_fraction = text.rsplit(".", 1)[1]
            separator = "dot" if len(last_fraction) <= 2 else "comma"
        else:
            separator = "dot"

    if separator == "comma":
        normalized = text.replace(".", "").replace(",", ".")
    else:
        normalized = text.replace(",", "")
    return normalized, negative


def _parse_amount(value: str, decimal_separator: str) -> tuple[Decimal, bool]:
    normalized, negative = _normalize_numeric_text(value, decimal_separator)
    try:
        amount = Decimal(normalized)
    except InvalidOperation as exc:
        raise ValueError("amount is not a valid decimal value") from exc
    if amount.as_tuple().exponent < -2:
        raise ValueError("amount must have at most two decimal places")
    amount = amount.quantize(MONEY_CENT)
    if amount == 0:
        raise ValueError("amount must not be zero")
    return (-amount if negative else amount), negative


def _parse_type(value: str) -> TransactionType:
    parsed = TYPE_ALIASES.get(_normalized_token(value))
    if parsed is None:
        raise ValueError(f"unknown transaction type: {value}")
    return parsed


def _resolve_type(
    raw_type: str | None,
    signed_amount: Decimal,
    convention: str,
    default_type: TransactionType,
) -> TransactionType:
    if raw_type is not None and raw_type.strip():
        return _parse_type(raw_type)
    if convention == "explicit_type":
        raise ValueError("transaction type is required by explicit_type convention")
    if convention == "negative_expense":
        return TransactionType.expense if signed_amount < 0 else TransactionType.income
    if convention == "positive_expense":
        return TransactionType.expense if signed_amount > 0 else TransactionType.income
    return default_type


def _parse_payment_method(value: str | None, default: PaymentMethod) -> PaymentMethod:
    if value is None or not value.strip():
        return default
    parsed = PAYMENT_METHOD_ALIASES.get(_normalized_token(value))
    if parsed is None:
        raise ValueError(f"unknown payment method: {value}")
    return parsed


def _resolve_category(
    raw_category: str | None,
    transaction_type: TransactionType,
    categories: dict[tuple[str, str], Category],
) -> Category:
    if raw_category is None or not raw_category.strip():
        name = "Other" if transaction_type == TransactionType.expense else "Salary"
    else:
        name = raw_category.strip()

    category = categories.get((name.lower(), transaction_type.value))
    if category is None:
        if raw_category is None or not raw_category.strip():
            raise ValueError(f"no default category is configured for {transaction_type.value}")
        raise ValueError(f"unknown or unavailable category: {raw_category}")
    return category


def _field(row: dict[str, str], column: str | None) -> str | None:
    return None if column is None else row.get(column, "")


def _prepare_candidate(
    row_number: int,
    row: dict[str, str],
    payload: CsvImportRequest,
    categories: dict[tuple[str, str], Category],
) -> _PreparedRow:
    transaction_date = _parse_date(
        _field(row, payload.mapping.date) or "",
        payload.options.dateFormat,
    )
    signed_amount, _ = _parse_amount(
        _field(row, payload.mapping.amount) or "",
        payload.options.decimalSeparator,
    )
    transaction_type = _resolve_type(
        _field(row, payload.mapping.type),
        signed_amount,
        payload.options.amountConvention,
        payload.options.defaultType,
    )
    amount = abs(signed_amount).quantize(MONEY_CENT)

    merchant = (_field(row, payload.mapping.merchant) or "").strip()
    if not merchant:
        raise ValueError("merchant is empty")
    if len(merchant) > 120:
        raise ValueError("merchant exceeds 120 characters")

    description = (_field(row, payload.mapping.description) or "").strip()
    if len(description) > 255:
        raise ValueError("description exceeds 255 characters")

    raw_currency = (_field(row, payload.mapping.currency) or "EUR").strip().upper()
    currency = "EUR" if raw_currency in {"", "€", "EURO", "EUROS"} else raw_currency
    if currency != "EUR":
        raise ValueError(
            "only EUR can be imported until multi-currency conversion is implemented"
        )

    category = _resolve_category(
        _field(row, payload.mapping.category),
        transaction_type,
        categories,
    )
    payment_method = _parse_payment_method(
        _field(row, payload.mapping.paymentMethod),
        payload.options.defaultPaymentMethod,
    )
    fingerprint = _transaction_fingerprint(
        transaction_date,
        amount,
        merchant,
        description,
        transaction_type,
        currency,
    )
    normalized = CsvNormalizedTransaction(
        date=transaction_date.isoformat(),
        merchant=merchant,
        description=description,
        amount=f"{amount:.2f}",
        currency=currency,
        category=category.name,
        type=transaction_type,
        paymentMethod=payment_method,
        fingerprint=fingerprint,
    )
    return _PreparedRow(
        row_number=row_number,
        transaction=normalized,
        category_id=category.id,
    )


def _existing_fingerprints(
    db: Session,
    user_id: UUID,
    candidates: list[_PreparedRow],
) -> set[str]:
    if not candidates:
        return set()
    dates = [date.fromisoformat(item.transaction.date) for item in candidates]
    statement = select(TransactionModel).where(
        TransactionModel.user_id == user_id,
        TransactionModel.transaction_date >= min(dates),
        TransactionModel.transaction_date <= max(dates),
    )
    fingerprints: set[str] = set()
    for transaction in db.scalars(statement).all():
        if transaction.import_fingerprint:
            fingerprints.add(transaction.import_fingerprint)
        fingerprints.add(
            _transaction_fingerprint(
                transaction.transaction_date,
                Decimal(str(transaction.amount)).quantize(MONEY_CENT),
                transaction.merchant,
                transaction.description,
                TransactionType(transaction.transaction_type),
                transaction.currency,
            )
        )
    return fingerprints


def _prepare_import(
    db: Session,
    user_id: UUID,
    payload: CsvImportRequest,
) -> _PreparedImport:
    parsed = _parse_csv(payload.content)
    _validate_mapping(payload, parsed.headers)
    categories = build_active_category_lookup(db, user_id)

    candidates: list[_PreparedRow] = []
    invalid_by_row: dict[int, list[str]] = {}
    for index, row in enumerate(parsed.rows, start=2):
        try:
            candidates.append(_prepare_candidate(index, row, payload, categories))
        except (ValueError, InvalidOperation) as exc:
            invalid_by_row[index] = [str(exc)]

    existing = _existing_fingerprints(db, user_id, candidates)
    seen = set(existing)
    candidates_by_row = {candidate.row_number: candidate for candidate in candidates}
    rows_to_import: list[_PreparedRow] = []
    preview_rows: list[CsvPreviewRow] = []
    duplicate_rows = 0

    for index, _row in enumerate(parsed.rows, start=2):
        if index in invalid_by_row:
            preview_rows.append(
                CsvPreviewRow(
                    rowNumber=index,
                    status="invalid",
                    errors=invalid_by_row[index],
                )
            )
            continue

        candidate = candidates_by_row[index]
        fingerprint = candidate.transaction.fingerprint
        if fingerprint in seen:
            duplicate_rows += 1
            preview_rows.append(
                CsvPreviewRow(
                    rowNumber=index,
                    status="duplicate",
                    transaction=candidate.transaction,
                )
            )
            continue

        seen.add(fingerprint)
        rows_to_import.append(candidate)
        preview_rows.append(
            CsvPreviewRow(
                rowNumber=index,
                status="valid",
                transaction=candidate.transaction,
            )
        )

    return _PreparedImport(
        parsed=parsed,
        file_hash=_file_hash(payload.content),
        preview_rows=preview_rows,
        rows_to_import=rows_to_import,
        duplicate_rows=duplicate_rows,
        invalid_rows=len(invalid_by_row),
    )


def preview_csv_import(
    db: Session,
    user_id: UUID,
    payload: CsvImportRequest,
) -> CsvPreviewResponse:
    prepared = _prepare_import(db, user_id, payload)
    return CsvPreviewResponse(
        fileHash=prepared.file_hash,
        delimiter=prepared.parsed.delimiter,
        headers=prepared.parsed.headers,
        rowsTotal=len(prepared.parsed.rows),
        validRows=len(prepared.rows_to_import),
        duplicateRows=prepared.duplicate_rows,
        invalidRows=prepared.invalid_rows,
        previewRows=prepared.preview_rows[:PREVIEW_ROW_LIMIT],
        previewTruncated=len(prepared.preview_rows) > PREVIEW_ROW_LIMIT,
    )


def _batch_response(batch: ImportBatch) -> ImportBatchResponse:
    return ImportBatchResponse(
        id=str(batch.id),
        filename=batch.filename,
        fileHash=batch.file_hash,
        rowsTotal=batch.rows_total,
        rowsImported=batch.rows_imported,
        duplicatesSkipped=batch.duplicates_skipped,
        invalidRows=batch.invalid_rows,
        createdAt=batch.created_at,
    )


def commit_csv_import(
    db: Session,
    user_id: UUID,
    payload: CsvImportRequest,
) -> CsvCommitResponse:
    prepared = _prepare_import(db, user_id, payload)
    if prepared.invalid_rows:
        invalid_preview = [
            row.model_dump()
            for row in prepared.preview_rows
            if row.status == "invalid"
        ][:20]
        raise CsvImportError(
            "Import blocked because the CSV contains invalid rows",
            details={
                "invalidRows": prepared.invalid_rows,
                "examples": invalid_preview,
            },
        )

    batch = ImportBatch(
        user_id=user_id,
        filename=payload.filename,
        file_hash=prepared.file_hash,
        rows_total=len(prepared.parsed.rows),
        rows_imported=len(prepared.rows_to_import),
        duplicates_skipped=prepared.duplicate_rows,
        invalid_rows=0,
    )
    try:
        db.add(batch)
        db.flush()
        for item in prepared.rows_to_import:
            transaction = item.transaction
            db.add(
                TransactionModel(
                    user_id=user_id,
                    category_id=item.category_id,
                    import_batch_id=batch.id,
                    import_fingerprint=transaction.fingerprint,
                    merchant=transaction.merchant,
                    description=transaction.description,
                    amount=Decimal(transaction.amount),
                    currency=transaction.currency,
                    transaction_date=date.fromisoformat(transaction.date),
                    transaction_type=transaction.type.value,
                    payment_method=transaction.paymentMethod.value,
                    is_recurring=False,
                    source="import",
                )
            )
        db.commit()
        db.refresh(batch)
    except IntegrityError as exc:
        db.rollback()
        raise CsvImportConflictError(
            "A matching import was committed concurrently; preview the file again"
        ) from exc
    except SQLAlchemyError:
        db.rollback()
        raise

    return CsvCommitResponse(
        batch=_batch_response(batch),
        importedCount=batch.rows_imported,
        duplicatesSkipped=batch.duplicates_skipped,
    )


def list_import_batches(
    db: Session,
    user_id: UUID,
    *,
    limit: int = 20,
) -> ImportBatchPage:
    batches = db.scalars(
        select(ImportBatch)
        .where(ImportBatch.user_id == user_id)
        .order_by(ImportBatch.created_at.desc())
        .limit(limit)
    ).all()
    total = db.scalar(
        select(func.count(ImportBatch.id)).where(ImportBatch.user_id == user_id)
    ) or 0
    return ImportBatchPage(
        items=[_batch_response(batch) for batch in batches],
        total=total,
    )
