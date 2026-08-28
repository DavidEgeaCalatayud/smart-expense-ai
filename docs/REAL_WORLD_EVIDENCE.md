# Real-world financial evidence

Smart Expense AI deliberately separates **protocol quality** from **real-world financial evidence**. Synthetic fixtures and CI prove causality, reproducibility and contract behavior; they are not evidence that a financial signal performs well on observed banking behavior.

This document records the first committed external real-data evidence run:

```text
berka-real-data-v1
```

The aggregate machine-readable result is committed as:

```text
docs/evidence/berka-real-data-v1.json
```

The raw Berka dataset is **not** committed.

## Source

The evaluated archive is the PKDD'99 Berka Financial Dataset supplied for the 1999 Discovery Challenge. The uploaded archive contains the original relational files and the accompanying financial-data guide.

The source guide describes:

- 4,500 accounts;
- 6,471 permanent payment orders;
- 1,056,320 account transactions;
- loans, cards, clients, dispositions and demographic relations in addition to the three relations used by this benchmark.

The evaluated archive fingerprint is:

```text
SHA-256 41b54b916533bc269c8d56da9306cec0f1cc40f2c8f5d96c216872e4296531fb
```

Core relation fingerprints are retained in the aggregate JSON so the evidence can be reproduced against the same bytes.

Provenance is explicitly:

```text
real_public_historical
```

It is **not** `real_private`, and it does not satisfy the private independent-label gate.

## Coverage

Observed period:

```text
1993-01-01 -> 1998-12-31
```

Aggregate coverage:

| Measure | Support |
| --- | ---: |
| Accounts | 4,500 |
| Transactions | 1,056,320 |
| Outflow transactions | 651,237 |
| Outgoing transfers | 208,283 |
| Permanent orders | 6,471 |
| Forecast account-month folds | 172,115 |

For forecasting, an outflow is a Berka transaction whose source `type` is not `PRIJEM` (credit). The evaluator does not convert amounts to EUR; metrics remain in native dataset monetary units.

## Forecast evidence

`berka-real-data-v1` evaluates the two transparent formulas that map cleanly onto the source without inventing merchant semantics:

1. previous-three-complete-month mean;
2. day-15 run rate: `spent_through_day_15 / 15 * days_in_month`.

Each account is evaluated walk-forward from its fourth observable calendar month through the dataset boundary. Previous complete months are history; for the run rate, transactions after day 15 are outcome only and cannot enter the prediction.

| Baseline | Account-months | MAE | Median absolute error | sMAPE | Bias |
| --- | ---: | ---: | ---: | ---: | ---: |
| Previous 3 months | 172,115 | **8,843.33** | **4,200.00** | **55.1756%** | -577.26 |
| Day-15 run rate | 172,115 | 11,083.95 | 6,300.00 | 66.0910% | +4,519.05 |

The day-15 run rate beats the three-month mean on only **35.24%** of account-month folds; 2.04% are ties.

### Interpretation

This is useful negative evidence. The more reactive baseline is not automatically better on real banking behavior. On Berka, the three-month mean is materially more stable by MAE and sMAPE, while the run rate has a strong positive bias.

This strengthens the existing `spending-forecast-v1` policy of retaining transparent baselines and requiring challengers to beat them empirically instead of promoting complexity by assumption.

This run does **not** claim a Berka score for the production recurrence-aware baseline. Berka lacks modern merchant descriptors and this evaluator intentionally avoids silently changing product semantics to manufacture that result.

## Recurring-payment evidence

Berka contains a separate `order.asc` relation for permanent payment orders and a `trans.asc` relation for realized transactions. That gives stronger recurring-payment evidence than deriving labels from the same detector being evaluated.

Order identity is linked to realized outgoing transfers with:

```text
source account
+ destination bank
+ destination account
+ payment characterization (k_symbol)
```

The amount is **not** required to identify the stream.

Observed linkage:

| Measure | Result |
| --- | ---: |
| Permanent orders | 6,471 |
| Orders linked to >=1 realized transfer | 5,788 |
| Linkage rate | **89.45%** |
| Linked realized occurrences | 197,403 |
| Orders with >=3 occurrences | 5,765 |
| Orders with >=6 occurrences | 5,721 |
| Orders with >=12 occurrences | 5,264 |
| Realized occurrence amount equal to permanent-order amount | 100% |

### Prior-only calendar reference baseline

To quantify how predictable these **bank standing orders** are, the evaluator includes a deliberately simple external-reference baseline:

```text
prior-only-calendar-order-baseline-v1
```

It is warmed up on the first three observed occurrences of a linked order. For each later calendar month until the last observed occurrence, it predicts from prior observations only:

- month-end when prior history is predominantly month-end;
- otherwise the historical median day-of-month;
- historical median amount.

A predicted and observed occurrence match within a seven-day tolerance.

| Metric | Result |
| --- | ---: |
| Evaluated streams | 5,747 |
| Prediction months | 180,610 |
| Matched occurrences | 180,077 |
| Extra predictions | 533 |
| Missed occurrences | 0 |
| Precision | **0.9970** |
| Recall | **1.0000** |
| F1 | **0.9985** |
| Date MAE | **0.0 days** |
| Within 3 days | **1.0000** |
| Amount MAE | **0.00** |

These very strong numbers describe **permanent bank orders in this dataset**. They must not be generalized to every subscription, card merchant or modern direct debit. The source relation itself represents a highly regular product class.

Crucially, this table is **not presented as a `historical-v2.2` production score**. It is real-domain reference evidence showing that a substantial portion of observed banking outflows contains stable, calendar-regular recurring structure.

## What Berka cannot validate

Berka should not be stretched beyond its labels.

### Category classifier

Not validated here.

The dataset does not contain modern merchant descriptors such as retailer/card statement strings, nor independent Smart Expense AI taxonomy labels. Therefore it cannot provide meaningful `tfidf-logreg-v1` accuracy, macro-F1 or natural unseen-merchant F1.

### Suggestion acceptance / correction

Not validated here.

There are no observed Smart Expense AI suggestion decisions, so acceptance and correction rates remain a private/product-usage evidence problem.

### Subjective anomaly usefulness

Not validated here.

A large or unusual real transaction is not automatically an alert a user would find useful. Berka has no independent user-reviewed anomaly labels, so the repository must not manufacture anomaly precision/recall from statistical outliers.

### `historical-v2.2` production recurrence score

Not claimed by this report.

The permanent-order relation provides valuable external ground truth, but the current committed result is a transparent reference baseline. A separate adapter/evaluation can later score production `historical-v2.2` on a carefully defined Berka-compatible descriptor policy without changing the meaning of the product model.

## Reproduction

Keep a local copy of the Berka dataset as either the extracted directory or ZIP archive, then run from `backend/`:

```bash
python scripts/evaluate_berka_real_data.py /path/to/berka-dataset-master.zip \
  --output /tmp/berka-real-data-v1.json
```

The evaluator:

- uses only Python standard-library parsing;
- reads `account.asc`, `order.asc` and `trans.asc`;
- fingerprints the input relations and ZIP when applicable;
- emits aggregate metrics only;
- never emits account IDs, counterparty accounts or transaction rows.

Compare the resulting report with `docs/evidence/berka-real-data-v1.json` only when the source fingerprints match.

## Evidence hierarchy after this run

The project should now describe its evidence honestly as:

| Capability | Synthetic/protocol evidence | Public observed financial evidence | Modern private/user evidence |
| --- | --- | --- | --- |
| Three-month forecast baseline | Yes | **Yes - Berka** | Pending |
| Day-15 run-rate baseline | Yes | **Yes - Berka** | Pending |
| Recurring-payment domain regularity | Yes | **Yes - Berka permanent orders** | Pending |
| `historical-v2.2` production recurrence quality | Yes | Not yet | Pending |
| `tfidf-logreg-v1` category quality | Yes | Berka not suitable | **Pending** |
| Suggestion acceptance/correction | Test contract only | Berka not suitable | **Pending** |
| `rules-v2` subjective anomaly usefulness | Yes | Berka not suitable | **Pending** |
| Modern recurrence-aware forecasting | Yes | Partial domain evidence only | **Pending** |

The correct next step is therefore not another synthetic challenger. It is modern/private labelled evidence for the cells that Berka cannot fill.
