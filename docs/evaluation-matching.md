# Optimal recurring-stream matching in evaluation

The historical evaluation harness must compare predicted recurring profiles with labelled ground truth without allowing input order to change the reported metrics.

Earlier revisions used a greedy first-compatible strategy:

```text
for label:
  take the first still-unused compatible prediction
```

That approach can produce a suboptimal assignment when labels overlap. A broad label can consume the only prediction that satisfies a narrower label, changing precision/recall depending on label or prediction order.

The evaluator now uses `hungarian_max_weight_v1`, a deterministic maximum-weight bipartite assignment implemented in `backend/app/services/historical_matching.py`.

## Assignment model

For every fold:

```text
labelled recurring streams
          x
predicted recurring profiles
          ↓
compatibility / utility matrix
          ↓
Hungarian assignment O(n^3)
          ↓
one-to-one optimal matching
```

One zero-utility dummy column is available per label. A label can therefore remain unmatched instead of being forced onto an incompatible profile. Predictions not selected by any label remain unmatched and are evaluated as false positives.

## Compatibility

Merchant identity is mandatory. Explicit ground-truth fields are treated as hard constraints:

- canonical merchant;
- calendar signature, when supplied;
- descriptor fragment, when supplied;
- cadence, when supplied;
- amount minimum/maximum, when supplied.

An explicit conflict makes the matrix edge incompatible.

This is deliberate: the evaluator must not award a partial match to a profile that contradicts a known ground-truth calendar or descriptor merely because another feature is close.

## Utility among compatible edges

Compatible candidates receive deterministic utility from:

```text
canonical merchant                 10,000
calendar signature match            5,000
descriptor match                    3,500
cadence match                       2,500
amount constraint specificity       1,000
amount closeness                    0..1,000
```

Amount closeness is measured against the centre of a labelled amount range. Narrow/exact ranges therefore prefer the corresponding amount, while broad ranges remain free to use another compatible prediction if that produces a better global assignment.

Example:

```text
labels:
  broad:  5..25 EUR
  narrow: 9..11 EUR

predictions:
  10 EUR
  20 EUR
```

A greedy broad-first matcher may consume 10 EUR and leave the narrow label unmatched. The global optimum is:

```text
narrow -> 10 EUR
broad  -> 20 EUR
```

so both ground-truth streams are evaluated correctly.

## Lifecycle priority

Cancellation/reactivation datasets can contain an inactive historical label and an active label that describe the same stream family. Active ground-truth labels receive a dominating lexicographic utility bonus during assignment.

This prevents an inactive lifecycle from consuming the only prediction belonging to a concurrently active/reactivated stream. If no active label competes for the prediction, a prediction compatible with an inactive label still matches that inactive label and is counted as a false positive, preserving cancellation evaluation.

## Permutation invariance

Before the matrix is built, labels and predictions are canonically sorted by semantic fields. The Hungarian solver therefore uses deterministic tie-breaking rather than input order.

Regression coverage permutes all orders of a three-label/three-profile case and requires:

```text
same semantic label/profile pairs
precision = 1.0
recall    = 1.0
```

The broad-vs-narrow regression additionally proves a case where greedy matching would produce fewer true positives than the optimal assignment.

## Auditability

Evaluation reports now expose:

```text
recurrenceMatchingStrategy = hungarian_max_weight_v1
```

and each fold records:

```text
recurrenceMatchingStrategy
recurrenceMatchingUtility
```

The utility is diagnostic evidence for reproducibility; it is not a model confidence score and must not be presented to end users as a probability.

## Complexity

The assignment is O(n^3), where `n` is the number of labels/profiles in a fold after padding. Historical analysis currently caps the number of recurring profiles, so this is small compared with database access and repeated historical feature extraction while avoiding a heavy numerical dependency solely for evaluation matching.
