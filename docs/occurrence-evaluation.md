# Occurrence-level recurring-payment evaluation

The historical evaluation harness now measures two different questions independently:

1. **Stream-level detection** — did the analysis identify the recurring stream at all?
2. **Occurrence-level prediction** — from information available before the target month, did the analysis predict the next concrete charge on the right date and at a reasonable amount?

The second layer is intentionally prospective. A July occurrence is predicted from a baseline ending on June 30. July transactions are ground truth only and are never included in the profile that produces July's `nextExpectedDate` or `medianAmount`.

## Ground-truth format

`expectedOccurrences` remains backwards-compatible with date-only labels:

```json
{
  "expectedOccurrences": ["2026-07-05"]
}
```

For amount-error evaluation, use the richer form:

```json
{
  "expectedOccurrences": [
    {
      "date": "2026-07-08",
      "amount": "12.00"
    }
  ]
}
```

Money remains decimal text. A missing `amount` means the occurrence can still contribute date/precision/recall metrics, but it is excluded from amount MAE/MAPE.

## Labelled evaluation months

Occurrence precision only makes sense when the dataset declares complete occurrence ground truth for the evaluated period. Datasets can therefore provide:

```json
{
  "evaluation": {
    "occurrenceEvaluationMonths": ["2026-07", "2026-08"],
    "occurrenceDateToleranceDays": 7
  }
}
```

When `occurrenceEvaluationMonths` is omitted, the harness evaluates only months containing at least one explicit `expectedOccurrences` label.

An unlabelled month is not treated as a negative month. Predictions in such a month are not counted as false positives because the dataset has not asserted that its occurrence ground truth is complete.

## Prospective fold

For an evaluation month `M`:

```text
transactions <= end(M - 1 month)
        ↓
fold-local merchant identity
        ↓
historical-v2.2 recurring profiles
        ↓
profile.nextExpectedDate in M
        ↓
predicted occurrence
        ↓
optimal matching against explicit expected occurrences in M
```

This baseline is independent of the existing stream-level detection fold, which may inspect the target month to evaluate whether a stream was detected by month-end.

## Matching

Occurrence matching uses deterministic maximum-weight bipartite assignment:

```text
matchingStrategy = hungarian_occurrence_max_weight_v1
```

A candidate edge must satisfy the stream-level ground-truth constraints (canonical merchant and any supplied cadence, calendar signature, descriptor and amount range). It must also fall within the configured date tolerance.

Among compatible candidates, utility favors:

- the same stream-level specificity used by the recurring evaluation matcher;
- smaller absolute date error;
- smaller amount error when an expected amount is labelled.

Dummy assignments allow both expected occurrences and predictions to remain unmatched. This means a missed charge is a false negative and an unexplained predicted charge is a false positive rather than a forced bad match.

## Metrics

Each evaluated fold and the aggregate report include:

```text
expectedOccurrences
predictedOccurrences
matchedOccurrences
missedOccurrences
extraPredictions
precision
recall
f1
dateMaeDays
dateMedianAbsoluteErrorDays
dateMeanSignedErrorDays
within3DaysRate
amountEvaluatedOccurrences
amountMae
amountMape
```

`dateMeanSignedErrorDays` preserves prediction bias:

```text
-3 → prediction was three days early
+2 → prediction was two days late
```

`amountMae` is a decimal string because it is a monetary quantity. Ratio metrics such as MAPE are non-monetary evaluation statistics.

## Auditable outcomes

Each fold also records its matched/missed/extra outcomes, for example:

```json
{
  "status": "matched",
  "labelId": "service-monthly",
  "streamKey": "service::default",
  "expectedDate": "2026-07-08",
  "predictedDate": "2026-07-05",
  "dateErrorDays": -3,
  "expectedAmount": "12.00",
  "predictedAmount": "10.00",
  "amountAbsoluteError": "2.00"
}
```

This makes aggregate metrics traceable back to individual forecasting decisions.

## What this does not claim

The synthetic occurrence fixture is a regression test for methodology, not evidence of real-world forecasting quality. Precision, recall and error metrics become meaningful product/model claims only after evaluation on sufficiently complete, independently labelled real-world datasets.
