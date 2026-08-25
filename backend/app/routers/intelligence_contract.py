from decimal import Decimal, InvalidOperation

from app.schemas import IntelligenceFindingResponse


MONEY_EVIDENCE_KEYS = {
    "medianAmount",
    "approximateAmount",
    "amount",
    "baselineMedian",
    "robustSpread",
    "threshold",
}
DECIMAL_EVIDENCE_KEYS = MONEY_EVIDENCE_KEYS | {"ratio"}


def _as_decimal(value: object) -> Decimal | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def to_legacy_finding(finding: IntelligenceFindingResponse) -> IntelligenceFindingResponse:
    evidence = dict(finding.evidence)
    for key in DECIMAL_EVIDENCE_KEYS:
        if key not in evidence:
            continue
        decimal_value = _as_decimal(evidence[key])
        if decimal_value is not None:
            evidence[key] = float(decimal_value)
    return finding.model_copy(update={"evidence": evidence})


def to_decimal_finding(finding: IntelligenceFindingResponse) -> IntelligenceFindingResponse:
    evidence = dict(finding.evidence)
    for key in DECIMAL_EVIDENCE_KEYS:
        if key not in evidence:
            continue
        decimal_value = _as_decimal(evidence[key])
        if decimal_value is not None:
            evidence[key] = format(decimal_value.quantize(Decimal("0.01")), "f")
    return finding.model_copy(update={"evidence": evidence})
