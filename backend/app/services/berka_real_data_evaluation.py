from __future__ import annotations

import csv
import hashlib
import zipfile
from calendar import monthrange
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from statistics import median
from tempfile import TemporaryDirectory

from app.analysis_contracts import BERKA_REAL_DATA_VERSION


CONTRACT_VERSION = BERKA_REAL_DATA_VERSION
SOURCE_TYPE = "real_public_historical"
DATASET_NAME = "PKDD'99 Berka Financial Dataset"
DATE_TOLERANCE_DAYS = 7
MONEY_QUANTUM = Decimal("0.01")
RATIO_QUANTUM = Decimal("0.0001")


def _money(value: Decimal) -> str:
    return format(value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP), "f")


def _ratio(value: Decimal) -> float:
    return float(value.quantize(RATIO_QUANTUM, rounding=ROUND_HALF_UP))


def _parse_date(value: str) -> date:
    raw = str(value).strip().split()[0]
    if len(raw) != 6 or not raw.isdigit():
        raise ValueError(f"Invalid Berka YYMMDD date: {value!r}")
    return date(1900 + int(raw[:2]), int(raw[2:4]), int(raw[4:6]))


def _month_index(value: date) -> int:
    return value.year * 12 + value.month - 1


def _month_from_index(value: int) -> tuple[int, int]:
    year, month_zero = divmod(value, 12)
    return year, month_zero + 1


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _resolve_dataset_root(root: Path) -> Path:
    candidates = [root]
    if root.is_dir():
        candidates.extend(path for path in root.iterdir() if path.is_dir())
    for candidate in candidates:
        if all((candidate / name).exists() for name in ("account.asc", "order.asc", "trans.asc")):
            return candidate
    raise FileNotFoundError("Expected account.asc, order.asc and trans.asc in the Berka dataset")


@dataclass(frozen=True)
class _PermanentOrder:
    order_id: str
    account_id: str
    key: tuple[str, str, str, str]
    amount: Decimal


@dataclass(frozen=True)
class _Transfer:
    transaction_date: date
    amount: Decimal


def _forecast_metrics(
    account_start: dict[str, int],
    account_end: dict[str, int],
    monthly_spend: dict[tuple[str, int], Decimal],
    first_half_spend: dict[tuple[str, int], Decimal],
) -> dict[str, object]:
    absolute_error = {
        "three_month_mean": Decimal("0"),
        "run_rate": Decimal("0"),
    }
    signed_error = {key: Decimal("0") for key in absolute_error}
    smape_total = {key: Decimal("0") for key in absolute_error}
    absolute_error_values: dict[str, list[Decimal]] = {
        key: [] for key in absolute_error
    }
    run_rate_wins = 0
    ties = 0
    folds = 0

    for account_id, start_month in account_start.items():
        last_observed_month = account_end.get(account_id)
        if last_observed_month is None:
            continue
        target_month = start_month + 3
        while target_month <= last_observed_month:
            actual = monthly_spend.get((account_id, target_month), Decimal("0"))
            three_month_mean = sum(
                (
                    monthly_spend.get((account_id, target_month - offset), Decimal("0"))
                    for offset in (3, 2, 1)
                ),
                Decimal("0"),
            ) / Decimal("3")
            year, month = _month_from_index(target_month)
            days_in_month = monthrange(year, month)[1]
            run_rate = (
                first_half_spend.get((account_id, target_month), Decimal("0"))
                / Decimal("15")
                * Decimal(days_in_month)
            )

            predictions = {
                "three_month_mean": three_month_mean,
                "run_rate": run_rate,
            }
            for baseline, predicted in predictions.items():
                error = predicted - actual
                abs_error = abs(error)
                absolute_error[baseline] += abs_error
                signed_error[baseline] += error
                absolute_error_values[baseline].append(abs_error)
                denominator = abs(predicted) + abs(actual)
                if denominator:
                    smape_total[baseline] += Decimal("2") * abs_error / denominator * Decimal("100")

            mean_error = abs(three_month_mean - actual)
            run_rate_error = abs(run_rate - actual)
            if run_rate_error < mean_error:
                run_rate_wins += 1
            elif run_rate_error == mean_error:
                ties += 1
            folds += 1
            target_month += 1

    if folds == 0:
        raise ValueError("Berka dataset produced no eligible forecasting folds")

    support = Decimal(folds)
    result: dict[str, object] = {}
    for baseline in absolute_error:
        result[baseline] = {
            "support": folds,
            "mae": _money(absolute_error[baseline] / support),
            "smapePercent": _ratio(smape_total[baseline] / support),
            "bias": _money(signed_error[baseline] / support),
            "medianAbsoluteError": _money(Decimal(median(absolute_error_values[baseline]))),
        }
    result["runRateWinRateVsThreeMonthMean"] = _ratio(Decimal(run_rate_wins) / support)
    result["tieRate"] = _ratio(Decimal(ties) / support)
    return result


def _recurrence_evidence(
    orders: list[_PermanentOrder],
    transfers: dict[tuple[str, str, str, str], list[_Transfer]],
) -> dict[str, object]:
    linked_orders = 0
    occurrence_counts: list[int] = []
    linked_occurrences = 0
    exact_order_amount_occurrences = 0

    matched = 0
    missed = 0
    extra = 0
    date_errors: list[Decimal] = []
    amount_errors: list[Decimal] = []
    evaluated_streams = 0
    prediction_months = 0

    for order in orders:
        rows = sorted(transfers.get(order.key, []), key=lambda item: item.transaction_date)
        if rows:
            linked_orders += 1
            occurrence_counts.append(len(rows))
            linked_occurrences += len(rows)
            exact_order_amount_occurrences += sum(item.amount == order.amount for item in rows)
        if len(rows) < 4:
            continue

        evaluated_streams += 1
        by_month: dict[int, list[_Transfer]] = defaultdict(list)
        for item in rows:
            by_month[_month_index(item.transaction_date)].append(item)

        history = list(rows[:3])
        target_month = _month_index(rows[2].transaction_date) + 1
        last_observed_month = _month_index(rows[-1].transaction_date)
        while target_month <= last_observed_month:
            prediction_months += 1
            month_end_history = sum(
                item.transaction_date.day
                == monthrange(item.transaction_date.year, item.transaction_date.month)[1]
                for item in history
            )
            year, month = _month_from_index(target_month)
            if Decimal(month_end_history) / Decimal(len(history)) >= Decimal("0.60"):
                predicted_day = monthrange(year, month)[1]
            else:
                predicted_day = min(
                    int(round(float(median([item.transaction_date.day for item in history])))),
                    monthrange(year, month)[1],
                )
            predicted_date = date(year, month, predicted_day)
            predicted_amount = Decimal(median([item.amount for item in history]))

            actuals = by_month.get(target_month, [])
            if actuals:
                closest = min(
                    actuals,
                    key=lambda item: abs((item.transaction_date - predicted_date).days),
                )
                date_error = abs((closest.transaction_date - predicted_date).days)
                if date_error <= DATE_TOLERANCE_DAYS:
                    matched += 1
                    date_errors.append(Decimal(date_error))
                    amount_errors.append(abs(closest.amount - predicted_amount))
                    missed += max(0, len(actuals) - 1)
                else:
                    missed += len(actuals)
                    extra += 1
                history.extend(actuals)
            else:
                extra += 1
            target_month += 1

    precision = Decimal(matched) / Decimal(matched + extra) if matched + extra else Decimal("0")
    recall = Decimal(matched) / Decimal(matched + missed) if matched + missed else Decimal("0")
    f1 = (
        Decimal("2") * precision * recall / (precision + recall)
        if precision + recall
        else Decimal("0")
    )

    return {
        "permanentOrders": len(orders),
        "linkedOrders": linked_orders,
        "linkedOrderRate": _ratio(Decimal(linked_orders) / Decimal(len(orders))),
        "ordersWithAtLeast3Occurrences": sum(count >= 3 for count in occurrence_counts),
        "ordersWithAtLeast6Occurrences": sum(count >= 6 for count in occurrence_counts),
        "ordersWithAtLeast12Occurrences": sum(count >= 12 for count in occurrence_counts),
        "linkedOccurrences": linked_occurrences,
        "exactOrderAmountOccurrenceRate": _ratio(
            Decimal(exact_order_amount_occurrences) / Decimal(linked_occurrences)
        ),
        "referenceBaseline": {
            "name": "prior-only-calendar-order-baseline-v1",
            "evaluationBoundary": "third_observed_occurrence_to_final_observed_occurrence",
            "evaluatedStreams": evaluated_streams,
            "predictionMonths": prediction_months,
            "matchedOccurrences": matched,
            "missedOccurrences": missed,
            "extraPredictions": extra,
            "precision": _ratio(precision),
            "recall": _ratio(recall),
            "f1": _ratio(f1),
            "dateMaeDays": (
                _ratio(sum(date_errors, Decimal("0")) / Decimal(len(date_errors)))
                if date_errors
                else None
            ),
            "within3DaysRate": (
                _ratio(
                    Decimal(sum(value <= Decimal("3") for value in date_errors))
                    / Decimal(len(date_errors))
                )
                if date_errors
                else None
            ),
            "amountMae": (
                _money(sum(amount_errors, Decimal("0")) / Decimal(len(amount_errors)))
                if amount_errors
                else None
            ),
        },
    }


def evaluate_berka_directory(root: Path) -> dict[str, object]:
    dataset_root = _resolve_dataset_root(root)
    account_file = dataset_root / "account.asc"
    order_file = dataset_root / "order.asc"
    transaction_file = dataset_root / "trans.asc"

    account_start: dict[str, int] = {}
    with account_file.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source, delimiter=";"):
            account_start[row["account_id"].strip()] = _month_index(_parse_date(row["date"]))

    orders: list[_PermanentOrder] = []
    with order_file.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source, delimiter=";"):
            account_id = row["account_id"].strip()
            key = (
                account_id,
                (row.get("bank_to") or "").strip(),
                (row.get("account_to") or "").strip(),
                (row.get("k_symbol") or "").strip(),
            )
            orders.append(
                _PermanentOrder(
                    order_id=row["order_id"].strip(),
                    account_id=account_id,
                    key=key,
                    amount=Decimal(row["amount"]),
                )
            )

    monthly_spend: dict[tuple[str, int], Decimal] = defaultdict(lambda: Decimal("0"))
    first_half_spend: dict[tuple[str, int], Decimal] = defaultdict(lambda: Decimal("0"))
    transfers: dict[tuple[str, str, str, str], list[_Transfer]] = defaultdict(list)
    account_end: dict[str, int] = {}
    transaction_count = 0
    outflow_count = 0
    outgoing_transfer_count = 0
    minimum_date: date | None = None
    maximum_date: date | None = None

    with transaction_file.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source, delimiter=";"):
            transaction_count += 1
            transaction_date = _parse_date(row["date"])
            amount = Decimal(row["amount"])
            account_id = row["account_id"].strip()
            month = _month_index(transaction_date)
            account_end[account_id] = max(account_end.get(account_id, month), month)
            minimum_date = transaction_date if minimum_date is None else min(minimum_date, transaction_date)
            maximum_date = transaction_date if maximum_date is None else max(maximum_date, transaction_date)

            if row["type"].strip() != "PRIJEM":
                outflow_count += 1
                monthly_spend[(account_id, month)] += amount
                if transaction_date.day <= 15:
                    first_half_spend[(account_id, month)] += amount

            if (row.get("operation") or "").strip() == "PREVOD NA UCET":
                outgoing_transfer_count += 1
                key = (
                    account_id,
                    (row.get("bank") or "").strip(),
                    (row.get("account") or "").strip(),
                    (row.get("k_symbol") or "").strip(),
                )
                transfers[key].append(_Transfer(transaction_date, amount))

    if minimum_date is None or maximum_date is None:
        raise ValueError("Berka transaction relation is empty")

    forecast = _forecast_metrics(
        account_start,
        account_end,
        monthly_spend,
        first_half_spend,
    )
    recurrence = _recurrence_evidence(orders, transfers)

    return {
        "contractVersion": CONTRACT_VERSION,
        "provenance": {
            "sourceType": SOURCE_TYPE,
            "dataset": DATASET_NAME,
            "periodStart": minimum_date.isoformat(),
            "periodEnd": maximum_date.isoformat(),
            "rawDataCommitted": False,
        },
        "sourceFingerprints": {
            name: _sha256(dataset_root / name)
            for name in ("account.asc", "order.asc", "trans.asc")
        },
        "coverage": {
            "accounts": len(account_start),
            "transactions": transaction_count,
            "outflowTransactions": outflow_count,
            "outgoingTransfers": outgoing_transfer_count,
            "permanentOrders": len(orders),
            "forecastAccountMonths": int(forecast["three_month_mean"]["support"]),
        },
        "forecastEvidence": forecast,
        "recurrenceEvidence": recurrence,
        "unsupportedEvidence": {
            "categoryClassifier": "Berka has no modern merchant descriptors or Smart Expense AI category gold labels.",
            "suggestionAcceptanceCorrection": "Berka contains no observed product suggestion decisions.",
            "subjectiveAnomalyUsefulness": "Berka contains no independent user-reviewed anomaly labels.",
            "productionHistoricalV22": "The recurring result is a transparent external-reference baseline grounded by permanent orders, not a historical-v2.2 production score.",
        },
        "limitations": [
            "Historical Czech banking data from 1993-1998; external validity to modern card/merchant behavior is limited.",
            "Outflows are defined as transaction type != PRIJEM following the source credit/withdrawal semantics.",
            "Forecast folds stop at each account's final observed transaction month; no post-observation zero-spend months are invented.",
            "Permanent-order linkage evaluates standing bank transfers and should not be generalized directly to merchant subscriptions.",
            "The recurring reference baseline ends at the final observed occurrence because order start/cancellation timestamps are unavailable; post-cancellation false positives are not measured.",
            "Forecast metrics evaluate the transparent three-month-mean and day-15 run-rate formulas; recurrence-aware production forecasting is not claimed here.",
            "Raw account and counterparty identifiers are intentionally omitted from this aggregate report.",
        ],
    }


def evaluate_berka_dataset(path: Path) -> dict[str, object]:
    if path.is_dir():
        return evaluate_berka_directory(path)
    if path.suffix.casefold() == ".zip":
        archive_fingerprint = _sha256(path)
        with TemporaryDirectory() as temp_directory:
            with zipfile.ZipFile(path) as archive:
                archive.extractall(temp_directory)
            report = evaluate_berka_directory(Path(temp_directory))
        provenance = dict(report["provenance"])
        provenance["sourceArchiveSha256"] = archive_fingerprint
        report["provenance"] = provenance
        return report
    raise ValueError("Expected a Berka directory or .zip archive")


__all__ = ["CONTRACT_VERSION", "evaluate_berka_dataset", "evaluate_berka_directory"]
