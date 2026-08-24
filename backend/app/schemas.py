from enum import Enum
from pydantic import BaseModel, EmailStr, Field


class TransactionType(str, Enum):
    expense = "expense"
    income = "income"


class TransactionStatus(str, Enum):
    normal = "normal"
    review = "review"


class PaymentMethod(str, Enum):
    card = "card"
    cash = "cash"
    bank_transfer = "bank_transfer"
    direct_debit = "direct_debit"


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    displayName: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    displayName: str = Field(..., min_length=1, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class AuthResponse(BaseModel):
    user: UserResponse


class CategoryResponse(BaseModel):
    id: str
    name: str
    transactionType: TransactionType


class TransactionBase(BaseModel):
    merchant: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=255)
    category: str = Field(..., min_length=1, max_length=80)
    amount: float = Field(..., gt=0)
    date: str = Field(..., min_length=10, max_length=10)
    type: TransactionType
    paymentMethod: PaymentMethod
    isRecurring: bool = False


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(TransactionBase):
    pass


class Transaction(TransactionBase):
    id: str
    status: TransactionStatus
