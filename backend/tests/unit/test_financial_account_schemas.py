from app.financial_account_schemas import (
    FinancialAccountCreateRequest,
    FinancialAccountUpdateRequest,
)
from app.sync_schemas import FinancialAccountSyncPayload


def test_broker_create_is_classified_as_investment() -> None:
    payload = FinancialAccountCreateRequest(
        name="Trading 212",
        institution="Trading 212",
        accountType="broker",
        purpose="daily",
        currentBalance="1000.00",
    )

    assert payload.purpose == "investment"


def test_broker_update_serializes_investment_purpose() -> None:
    payload = FinancialAccountUpdateRequest(
        accountType="broker",
        purpose="daily",
    )

    assert payload.purpose == "investment"
    assert payload.model_dump(exclude_unset=True)["purpose"] == "investment"


def test_broker_sync_payload_is_classified_as_investment() -> None:
    payload = FinancialAccountSyncPayload(
        name="Trade Republic",
        institution="Trade Republic",
        accountType="broker",
        purpose="opportunities",
        currentBalance="1000.00",
        currency="EUR",
        includeInNetWorth=True,
        archived=False,
        balanceUpdatedAt="2026-09-27T18:00:00Z",
    )

    assert payload.purpose == "investment"
    assert payload.model_dump(mode="json")["purpose"] == "investment"
