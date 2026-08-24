from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas import RegisterRequest, UserResponse


LEGACY_USER_ID = UUID("00000000-0000-4000-8000-000000000001")
LEGACY_USER_EMAIL = "legacy-migration@local.invalid"
DUMMY_PASSWORD_HASH = hash_password("dummy-password-used-only-for-timing-equalization")


class UserAlreadyExistsError(ValueError):
    pass


def normalize_email(email: str) -> str:
    return email.strip().lower()


def to_user_response(user: User) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        email=user.email,
        displayName=user.display_name,
    )


def register_user(db: Session, payload: RegisterRequest) -> User:
    email = normalize_email(str(payload.email))
    password_hash = hash_password(payload.password)
    existing = db.scalar(select(User).where(func.lower(User.email) == email))
    if existing is not None:
        raise UserAlreadyExistsError("Unable to create account")

    active_user_count = db.scalar(
        select(func.count()).select_from(User).where(User.is_active.is_(True))
    ) or 0

    user = User(
        email=email,
        display_name=payload.displayName.strip(),
        password_hash=password_hash,
        is_active=True,
    )
    db.add(user)

    try:
        db.flush()

        if active_user_count == 0:
            legacy_user = db.get(User, LEGACY_USER_ID)
            if legacy_user is not None and not legacy_user.is_active:
                db.execute(
                    update(Transaction)
                    .where(Transaction.user_id == legacy_user.id)
                    .values(user_id=user.id)
                )
                db.delete(legacy_user)

        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise UserAlreadyExistsError("Unable to create account") from exc
    except Exception:
        db.rollback()
        raise

    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    normalized_email = normalize_email(email)
    user = db.scalar(select(User).where(func.lower(User.email) == normalized_email))
    if user is None or not user.is_active:
        verify_password(password, DUMMY_PASSWORD_HASH)
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user
