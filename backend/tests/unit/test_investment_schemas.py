import pytest
from pydantic import ValidationError

from app.investment_schemas import InvestmentPositionCreateRequest


def test_investment_position_normalizes_isin() -> None:
    payload = InvestmentPositionCreateRequest.model_validate(
        {
            "financialAccountId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "name": "JPM Korea Equity",
            "isin": "lu0301637293",
            "units": "1.25000000",
            "costTotal": "33.92",
        }
    )
    assert payload.isin == "LU0301637293"


def test_investment_position_rejects_numeric_money_and_units() -> None:
    with pytest.raises(ValidationError):
        InvestmentPositionCreateRequest.model_validate(
            {
                "financialAccountId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
                "name": "Fidelity S&P 500",
                "isin": "IE00BYX5MX67",
                "units": 12.5,
                "costTotal": 5000.0,
            }
        )
