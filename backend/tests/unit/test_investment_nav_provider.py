from decimal import Decimal

from app.services.investment_nav_provider import (
    NAV_SOURCES,
    parse_borsa_italiana_nav,
    parse_jpmorgan_nav,
)


def test_parse_jpmorgan_public_nav() -> None:
    html = """
    <div>NAV (Valor Liquidativo)</div>
    <div>A fecha de 06.10.2026</div>
    <div>EUR 35,83</div>
    """
    quote = parse_jpmorgan_nav(
        "LU0301637293",
        NAV_SOURCES["LU0301637293"].source_url,
        html,
    )
    assert quote.nav == Decimal("35.83")
    assert quote.valuation_date.isoformat() == "2026-10-06"
    assert quote.currency == "EUR"


def test_parse_fidelity_borsa_italiana_nav() -> None:
    html = """
    <div>Fidelity S&amp;P 500 Index P Eur Cap Eur</div>
    <div>Ultima Precedente Valuta Data Variazione 16,828 16,656 EUR 01/10/26 +1,03</div>
    <div>Isin IE00BYX5MX67</div>
    """
    quote = parse_borsa_italiana_nav(
        "IE00BYX5MX67",
        NAV_SOURCES["IE00BYX5MX67"].source_url,
        html,
    )
    assert quote.nav == Decimal("16.828")
    assert quote.valuation_date.isoformat() == "2026-10-01"
    assert quote.currency == "EUR"
