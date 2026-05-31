from uuid import uuid4
from app.schemas import Transaction, TransactionCreate, TransactionStatus, TransactionType, TransactionUpdate


def calculate_status(amount: float, transaction_type: TransactionType) -> TransactionStatus:
    if transaction_type == TransactionType.expense and amount > 120:
        return TransactionStatus.review
    return TransactionStatus.normal


def calculate_ai_confidence(description: str) -> int:
    return 84 if description.strip() else 68


_transactions: list[Transaction] = [
    Transaction(
        id="trx_001",
        merchant="Mercadona",
        description="Weekly groceries",
        category="Food",
        amount=64.35,
        date="2026-05-30",
        type=TransactionType.expense,
        paymentMethod="card",
        status=TransactionStatus.normal,
        aiConfidence=96,
        isRecurring=False,
    ),
    Transaction(
        id="trx_002",
        merchant="Netflix",
        description="Monthly streaming subscription",
        category="Subscriptions",
        amount=15.99,
        date="2026-05-29",
        type=TransactionType.expense,
        paymentMethod="direct_debit",
        status=TransactionStatus.review,
        aiConfidence=88,
        isRecurring=True,
    ),
]


def list_transactions() -> list[Transaction]:
    return _transactions


def create_transaction(payload: TransactionCreate) -> Transaction:
    transaction = Transaction(
        id=f"trx_{uuid4().hex[:12]}",
        **payload.model_dump(),
        status=calculate_status(payload.amount, payload.type),
        aiConfidence=calculate_ai_confidence(payload.description),
    )
    _transactions.insert(0, transaction)
    return transaction


def update_transaction(transaction_id: str, payload: TransactionUpdate) -> Transaction | None:
    for index, transaction in enumerate(_transactions):
        if transaction.id == transaction_id:
            status = payload.status or calculate_status(payload.amount, payload.type)
            updated_transaction = Transaction(
                id=transaction_id,
                **payload.model_dump(exclude={"status"}),
                status=status,
                aiConfidence=calculate_ai_confidence(payload.description),
            )
            _transactions[index] = updated_transaction
            return updated_transaction
    return None


def delete_transaction(transaction_id: str) -> bool:
    for index, transaction in enumerate(_transactions):
        if transaction.id == transaction_id:
            del _transactions[index]
            return True
    return False
