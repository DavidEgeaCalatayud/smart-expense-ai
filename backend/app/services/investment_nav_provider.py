from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
import html as html_module
import re

import httpx


@dataclass(frozen=True)
class NavQuote:
    isin: str
    nav: Decimal
    currency: str
    valuation_date: date
    provider: str
    source_url: str


@dataclass(frozen=True)
class NavSource:
    isin: str
    name: str
    provider: str
    source_url: str


NAV_SOURCES: dict[str, NavSource] = {
    "LU0301637293": NavSource(
        isin="LU0301637293",
        name="JPM Korea Equity A (acc) - EUR",
        provider="jpmorgan",
        source_url="https://am.jpmorgan.com/es/es/asset-management/adv/products/jpm-korea-equity-a-acc-eur-lu0301637293",
    ),
    "IE00BYX5MX67": NavSource(
        isin="IE00BYX5MX67",
        name="Fidelity S&P 500 Index Fund P-ACC-Euro",
        provider="borsa_italiana",
        source_url="https://www.borsaitaliana.it/borsa/fondi/dettaglio/2FADB520528.html",
    ),
}


def is_auto_priced(isin: str) -> bool:
    return isin.upper() in NAV_SOURCES


def _text(html: str) -> str:
    without_scripts = re.sub(r"<script\b[^>]*>.*?</script>", " ", html, flags=re.I | re.S)
    without_styles = re.sub(r"<style\b[^>]*>.*?</style>", " ", without_scripts, flags=re.I | re.S)
    plain = re.sub(r"<[^>]+>", " ", without_styles)
    return re.sub(r"\s+", " ", html_module.unescape(plain)).strip()


def _number(value: str) -> Decimal:
    normalized = value.strip().replace("\xa0", "")
    if "," in normalized and "." in normalized:
        if normalized.rfind(",") > normalized.rfind("."):
            normalized = normalized.replace(".", "").replace(",", ".")
        else:
            normalized = normalized.replace(",", "")
    elif "," in normalized:
        normalized = normalized.replace(",", ".")
    return Decimal(normalized)


def parse_jpmorgan_nav(isin: str, source_url: str, html: str) -> NavQuote:
    text = _text(html)
    match = re.search(
        r"NAV\s*\(Valor Liquidativo\).*?A fecha de\s+(\d{2}\.\d{2}\.\d{4}).*?EUR\s+([0-9][0-9.,]*)",
        text,
        flags=re.I,
    )
    if not match:
        match = re.search(
            r"A fecha de\s+(\d{2}\.\d{2}\.\d{4}).{0,120}?EUR\s+([0-9][0-9.,]*)",
            text,
            flags=re.I,
        )
    if not match:
        raise ValueError("J.P. Morgan NAV could not be parsed")
    valuation_date = datetime.strptime(match.group(1), "%d.%m.%Y").date()
    return NavQuote(isin=isin, nav=_number(match.group(2)), currency="EUR", valuation_date=valuation_date, provider="jpmorgan", source_url=source_url)


def parse_borsa_italiana_nav(isin: str, source_url: str, html: str) -> NavQuote:
    text = _text(html)
    if isin not in text:
        raise ValueError("Borsa Italiana page does not match the requested ISIN")
    price_match = re.search(r"(?:Ultima|Ultimo).*?(?:Variazione|Variation)\s+([0-9][0-9.,]*)", text, flags=re.I)
    if not price_match:
        price_match = re.search(r"\b([0-9]{1,4}[.,][0-9]{2,6})\b.*?\bEUR\b", text, flags=re.I)
    date_match = re.search(r"\b([0-3]\d/[01]\d/(?:\d{2}|\d{4}))\b", text)
    if not price_match or not date_match:
        raise ValueError("Borsa Italiana NAV could not be parsed")
    raw_date = date_match.group(1)
    valuation_date = datetime.strptime(raw_date, "%d/%m/%y" if len(raw_date) == 8 else "%d/%m/%Y").date()
    return NavQuote(isin=isin, nav=_number(price_match.group(1)), currency="EUR", valuation_date=valuation_date, provider="borsa_italiana", source_url=source_url)


def parse_nav(source: NavSource, html: str) -> NavQuote:
    if source.provider == "jpmorgan":
        return parse_jpmorgan_nav(source.isin, source.source_url, html)
    if source.provider == "borsa_italiana":
        return parse_borsa_italiana_nav(source.isin, source.source_url, html)
    raise ValueError(f"Unsupported NAV provider: {source.provider}")


def fetch_public_nav(isin: str, *, timeout_seconds: float = 6.0) -> NavQuote | None:
    source = NAV_SOURCES.get(isin.upper())
    if source is None:
        return None
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; SmartExpenseAI/1.0; +https://github.com/DavidEgeaCalatayud/smart-expense-ai)",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.7",
    }
    with httpx.Client(timeout=timeout_seconds, follow_redirects=True, headers=headers) as client:
        response = client.get(source.source_url)
        response.raise_for_status()
    return parse_nav(source, response.text)
