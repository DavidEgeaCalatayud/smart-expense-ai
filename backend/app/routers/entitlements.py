from fastapi import APIRouter, Depends

from app.auth.dependencies import get_current_user
from app.entitlement_schemas import EntitlementsResponse
from app.models.user import User
from app.services.entitlement_service import build_entitlements


router = APIRouter(prefix="/entitlements", tags=["entitlements"])


@router.get("", response_model=EntitlementsResponse)
def get_entitlements(
    current_user: User = Depends(get_current_user),
) -> EntitlementsResponse:
    return build_entitlements(current_user)
