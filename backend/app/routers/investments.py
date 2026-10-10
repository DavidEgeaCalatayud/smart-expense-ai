from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.core.api_errors import ApiError
from app.db.session import get_db
from app.investment_schemas import (
    InvestmentHoldingsUpdateRequest,
    InvestmentMovementResponse,
    InvestmentPortfolioHistoryResponse,
    InvestmentPortfolioResponse,
    InvestmentPositionCreateRequest,
    InvestmentPositionResponse,
    NavRefreshResponse,
)
from app.models.user import User
from app.services.investment_service import (
    archive_position,
    create_position,
    get_portfolio_history,
    list_portfolios,
    list_position_movements,
    refresh_user_navs,
    update_position_holdings,
)

router = APIRouter(tags=["investments-v2"])

@router.get("/investments/portfolios", response_model=list[InvestmentPortfolioResponse])
def get_investment_portfolios(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[InvestmentPortfolioResponse]:
    return list_portfolios(db, current_user.id)

@router.post("/investments/positions", response_model=InvestmentPositionResponse, status_code=status.HTTP_201_CREATED)
def post_investment_position(
    payload: InvestmentPositionCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InvestmentPositionResponse:
    try:
        return create_position(db, current_user.id, payload)
    except LookupError as exc:
        raise ApiError(status.HTTP_404_NOT_FOUND, "financial_account_not_found", str(exc)) from exc
    except ValueError as exc:
        raise ApiError(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid_investment_position", str(exc)) from exc

@router.put("/investments/positions/{position_id}/holdings", response_model=InvestmentPositionResponse)
def put_investment_holdings(
    position_id: UUID,
    payload: InvestmentHoldingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InvestmentPositionResponse:
    position = update_position_holdings(db, current_user.id, position_id, payload)
    if position is None:
        raise ApiError(status.HTTP_404_NOT_FOUND, "investment_position_not_found", "Investment position not found")
    return position

@router.delete("/investments/positions/{position_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_investment_position(
    position_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not archive_position(db, current_user.id, position_id):
        raise ApiError(status.HTTP_404_NOT_FOUND, "investment_position_not_found", "Investment position not found")

@router.get("/investments/positions/{position_id}/movements", response_model=list[InvestmentMovementResponse])
def get_investment_position_movements(
    position_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[InvestmentMovementResponse]:
    movements = list_position_movements(db, current_user.id, position_id)
    if movements is None:
        raise ApiError(status.HTTP_404_NOT_FOUND, "investment_position_not_found", "Investment position not found")
    return movements

@router.post("/investments/nav/refresh", response_model=NavRefreshResponse)
def post_refresh_investment_navs(
    force: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NavRefreshResponse:
    return refresh_user_navs(db, current_user.id, force=force)

@router.get("/investments/portfolios/{account_id}/history", response_model=InvestmentPortfolioHistoryResponse)
def get_investment_portfolio_history(
    account_id: UUID,
    range_name: str = Query("1y", alias="range", pattern="^(1m|3m|1y|all)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InvestmentPortfolioHistoryResponse:
    history = get_portfolio_history(db, current_user.id, account_id, range_name)
    if history is None:
        raise ApiError(status.HTTP_404_NOT_FOUND, "financial_account_not_found", "Investment portfolio not found")
    return history
