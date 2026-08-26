# CSV transaction import

Smart Expense AI supports authenticated historical transaction ingestion through the API v2 CSV import workflow. The feature is intentionally split into **detect → map → preview → commit** so parsing decisions and duplicate handling are visible before financial data is persisted.

## Workflow

```text
CSV file
  ↓
POST /api/v2/imports/csv/detect
  ↓ delimiter + headers + suggested mapping
User reviews mapping and normalization rules
  ↓
POST /api/v2/imports/csv/preview
  ↓ valid / duplicate / invalid rows
User confirms
  ↓
POST /api/v2/imports/csv/commit
  ↓ one database transaction
transactions(source=import) + import_batches audit record
```

The frontend exposes this flow through **Import CSV** in the authenticated workspace.

## Input limits

- UTF-8 text CSV; an optional UTF-8 BOM is ignored.
- Maximum request content: 2,000,000 characters. The browser upload UI also limits files to 2 MB.
- Maximum 10,000 non-empty data rows per import.
- A header row is required.
- Column names must be non-empty and unique.
- Supported delimiter detection: comma, semicolon, tab and pipe.

The backend always reparses and revalidates the file at commit time; the preview response is not trusted as an authorization or persistence token.

## Column mapping

Required mappings:

- `date`
- `amount`
- `merchant`

Optional mappings:

- `description`
- `category`
- `type`
- `currency`
- `paymentMethod`

Detection suggests common English and Spanish banking headers such as `Date` / `Fecha`, `Amount` / `Importe`, `Merchant` / `Concepto`, `Description` / `Referencia`, `Category` / `Categoria`, and `Currency` / `Moneda`. Suggestions are only a convenience; the reviewed mapping is what drives normalization.

## Date formats

The importer supports explicit:

- `YYYY-MM-DD`
- `DD/MM/YYYY`
- `MM/DD/YYYY`
- `DD-MM-YYYY`

`auto` accepts unambiguous ISO/European forms (`YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY/MM/DD`). It deliberately does not guess US `MM/DD/YYYY`; select that format explicitly when required.

## Money normalization

Money remains decimal throughout the backend and is persisted in PostgreSQL `NUMERIC(12,2)`.

The importer supports:

- decimal comma (`42,51`);
- decimal point (`42.51`);
- common thousands separators when the decimal convention is explicit or inferable;
- leading `+` / `-` signs;
- parenthesized negative amounts;
- common currency symbols/text around the numeric value.

Values with more than two decimal places or zero amounts are rejected. Imported amounts are persisted as positive magnitudes; transaction direction is represented by `transaction_type`, matching the existing domain model.

### Amount conventions

`negative_expense`
: negative amounts are expenses and positive amounts are income. This is the default for many bank exports.

`positive_expense`
: positive amounts are expenses and negative amounts are income.

`explicit_type`
: direction comes from a mapped type column. A type mapping is mandatory in this mode.

Recognized type aliases include `expense`, `gasto`, `debit`, `debito`, `cargo`, `income`, `ingreso`, `credit`, `credito` and `abono`.

## Categories and payment methods

If category is not mapped or the cell is empty:

- expenses fall back to the persisted `Other` category;
- income falls back to the persisted `Salary` category.

A non-empty unknown category is rejected. A known category whose transaction type is incompatible with the row is also rejected. The importer never silently creates categories.

If payment method is absent, the configured default is used (`bank_transfer` by default). Common English/Spanish aliases are recognized for card, cash, bank transfer and direct debit.

## Currency policy

CSV import currently accepts **EUR only**. Empty currency cells default to EUR; `€`, `EURO` and `EUROS` normalize to `EUR`.

Non-EUR rows are invalid until a proper multi-currency/FX model exists. This is a deliberate accounting guard: current aggregate analytics sum transaction amounts directly, so accepting mixed currencies would create financially incorrect totals.

## Preview semantics

Every data row is classified as:

- `valid`: normalized and eligible to insert;
- `duplicate`: already represented in the current account or repeated earlier in the same CSV;
- `invalid`: cannot be safely normalized under the reviewed mapping/options.

Counts cover the entire file. The API returns detailed preview rows for the first 100 entries only so large imports do not create unnecessarily large responses.

## Duplicate fingerprint

For each normalized movement the backend computes SHA-256 over this canonical tuple:

```text
date
amount (two decimal places)
transaction type
currency
normalized merchant
normalized description/reference
```

Merchant and description normalization uses Unicode decomposition, lowercase alphanumeric tokens and normalized whitespace.

The database enforces a partial unique index on:

```text
(user_id, import_fingerprint)
WHERE import_fingerprint IS NOT NULL
```

This gives two important properties:

1. uploading the same statement again does not duplicate transactions for that user;
2. an identical legitimate movement belonging to another authenticated user is not treated as their duplicate.

Preview also recomputes equivalent fingerprints for existing manual transactions in the relevant date range. A CSV movement therefore cannot silently duplicate an already-entered manual movement merely because the older row has no stored import fingerprint.

Repeated identical rows inside one CSV are detected in input order: the first eligible row is valid and later identical rows are duplicates.

## Transactional commit

The commit endpoint reparses the original CSV and repeats all validation and duplicate checks.

If **any invalid row exists**, the endpoint returns `422 invalid_csv_import` and writes **nothing**: no transactions and no import batch. This prevents a user from believing a partially accepted statement is complete.

If validation is clean:

- valid, non-duplicate rows are inserted with `source = 'import'`;
- duplicate rows are skipped;
- one `import_batches` record is written in the same database transaction;
- each imported transaction stores its `import_batch_id` and `import_fingerprint`.

A duplicate-only re-import still creates an audit batch with `rows_imported = 0` and `duplicates_skipped = N`. The file was intentionally processed, and retaining that fact makes the operation explainable.

A database uniqueness race during concurrent imports causes the whole transaction to roll back and returns `409 csv_import_conflict`, instructing the client to preview again.

## Import batch audit data

`import_batches` stores:

- batch ID;
- authenticated user ID;
- original filename;
- SHA-256 file hash;
- total data rows;
- imported rows;
- skipped duplicates;
- invalid-row count;
- creation time.

`GET /api/v2/imports/batches` returns only batches owned by the current authenticated user.

## Security and privacy

All import endpoints require the existing HttpOnly authenticated session. Duplicate queries and batch history are scoped by `user_id` before financial data leaves the API.

The CSV is processed in request memory and is **not persisted as raw file content**. Only normalized transactions, the batch metadata and SHA-256 hashes/fingerprints are stored.

Deleting the account cascades its import batches and transactions through database foreign keys. Import batch metadata is included in the authenticated `privacy-export-v1` response so ingestion history remains portable with the rest of the account data.

## What this does not do

The first production-oriented CSV contract intentionally does not attempt to:

- ingest XLS/XLSX or PDFs;
- guess arbitrary bank-specific schemas beyond header/delimiter suggestions;
- create new categories automatically;
- convert foreign currencies;
- mark imported transactions recurring merely because they resemble a subscription;
- run intelligence automatically as a side effect of import.

Imported rows simply become normal persisted historical transactions. Existing analytics/intelligence can then analyze them through the same account-isolated data path as manually entered transactions.
