from fastapi import APIRouter, HTTPException, status
from app.schemas import Transaction, TransactionCreate, TransactionUpdate
from app.store import create_transaction, delete_transaction, list_transactions, update_transaction

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[Transaction])
def get_transactions() -> list[Transaction]:
    return list_transactions()


@router.post("", response_model=Transaction, status_code=status.HTTP_201_CREATED)
def post_transaction(payload: TransactionCreate) -> Transaction:
    return create_transaction(payload)


@router.put("/{transaction_id}", response_model=Transaction)
def put_transaction(transaction_id: str, payload: TransactionUpdate) -> Transaction:
    transaction = update_transaction(transaction_id, payload)

    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    return transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_transaction(transaction_id: str) -> None:
    deleted = delete_transaction(transaction_id)

    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")
