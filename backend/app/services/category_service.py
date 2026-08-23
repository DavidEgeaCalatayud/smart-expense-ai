from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.schemas import CategoryResponse, TransactionType


def list_categories(db: Session) -> list[CategoryResponse]:
    statement = select(Category).order_by(Category.transaction_type, Category.name)
    categories = db.scalars(statement).all()

    return [
        CategoryResponse(
            id=str(category.id),
            name=category.name,
            transactionType=TransactionType(category.transaction_type),
        )
        for category in categories
    ]
