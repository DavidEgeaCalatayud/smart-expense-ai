# Architecture

## Purpose

This document describes the **implemented** Smart Expense AI architecture. Future ideas belong in `ROADMAP.md`; speculative modules are not presented as current behavior.

Current versioned analytical contracts are centralized in `backend/app/analysis_contracts.py` and explained in [`analysis-contracts.md`](analysis-contracts.md). The Financial Assistant composes those services but does not replace them as a source of truth.

## High-level system

```text
Browser
  |
  v
Nginx + React 19 / TypeScript / Vite
  |
  | /api/* reverse proxy
  v
FastAPI
  |
  +---------------- Authentication / authorization
  +---------------- Transaction / category / budget / import services
  +---------------- Category suggestion + correction feedback
  +---------------- rules-v2 actionable findings
  +---------------- historical-v2.2 persisted diagnostics
  +---------------- recurring-calendar-v1 upcoming-payment projection
  +---------------- spending-forecast-v1 deterministic month-end projection
  +---------------- Financial Assistant orchestration
  |                         |
  |                         +--> bounded read-only domain tools
  |                         +--> optional external LLM provider
  |
  v
SQLAlchemy 2
  |
  v
PostgreSQL 16

Evaluation / ML evidence
  |
  +---------------- financial-benchmark-v1
  +---------------- spending-forecast-benchmark-v1
  +---------------- anomaly-challenger-benchmark-v1
  +---------------- chronological evaluation harnesses
  +---------------- merchant-group cold-start / calibration diagnostics
  +---------------- private-real-data-v1 local aggregate evaluator
```

The `tfidf-logreg-v1` classifier is loaded by the production backend as a **suggestion** layer. It never silently assigns a category and does not expose uncalibrated confidence.

Financial Assistant v1 may call an external language-model provider, but the LLM is limited to selecting bounded tools and explaining evidence returned by backend services. Exact financial calculations, budgets, findings and historical facts remain backend-owned.

The private real-data evaluator and benchmark workflows are evaluation paths, not additional financial sources of truth.

## Repository layout

```text
smart-expense-ai/
├── frontend/
│   ├── src/                    # React application and typed API client
│   └── e2e/                    # Playwright critical flows
├── backend/
│   ├── app/
│   │   ├── integrations/llm/   # provider protocol + OpenAI adapter
│   │   ├── models/             # SQLAlchemy models
│   │   ├── routers/            # FastAPI routes
│   │   ├── services/           # business/projection/intelligence/assistant services
│   │   ├── analysis_contracts.py
│   │   └── main.py
│   ├── ml/                     # runtime classifier + evaluation helpers
│   ├── benchmark/              # deterministic benchmark generation
│   ├── datasets/
│   ├── scripts/                # historical/private/forecast evaluators
│   └── tests/
├── data/private/               # ignored local financial evaluation data
├── ai/                         # model cards / ML evidence documentation
├── docs/
├── .github/workflows/
├── compose.yaml
├── ROADMAP.md
├── CHANGELOG.md
├── SECURITY.md
├── LICENSE
└── README.md
```

## Frontend

The React/TypeScript frontend is served by Nginx. Responsibilities include authentication/session UX, transaction/category/budget/import workflows, category suggestion controls, Financial Intelligence review, Historical Analysis visualization, Predictions, Financial Assistant presentation and typed API/error handling.

The **Predictions** workspace consumes two server-authoritative projections:

```text
recurring-calendar-v1 -> upcoming recurring charges / overdue schedules
spending-forecast-v1  -> month-end baselines + walk-forward error evidence
```

The protected **Assistant** workspace submits one stateless question and renders the returned natural-language answer, canonical evidence labels, limitations and request ID. It does not send a user identifier, calculate financial deltas, reconstruct budgets/findings, retain a chat thread or decide which persisted account is queried.

The browser groups/formats results but does not reproduce recurrence detection, forecast arithmetic, budget arithmetic, anomaly policy, historical analysis or assistant evidence validation.

## Edge / reverse proxy

Nginx is the browser-facing service in Docker Compose. It provides static frontend delivery, `/api/*` proxying, authentication endpoint rate limiting and browser security headers. PostgreSQL and FastAPI are not published directly to the host in the normal Compose topology.

OpenAI configuration, when supplied, is forwarded only to the backend container. No provider API key is compiled into the frontend image.

## Backend API

FastAPI exposes authenticated versioned endpoints under `/api/v1` and `/api/v2`.

Key responsibilities:

- registration/login/logout/session validation;
- user-scoped transaction CRUD;
- system + account-owned category management;
- persisted budgets and CSV imports;
- category suggestion preview and feedback persistence;
- aggregate analytics;
- `spending-forecast-v1` month-end forecast/backtest response;
- explicit Financial Intelligence scans/findings;
- persisted historical-analysis snapshots;
- deterministic upcoming-payment projection;
- stateless evidence-grounded Financial Assistant orchestration;
- normalized error envelopes.

API v2 is the preferred strict monetary contract and uses decimal strings for financial amounts.

## Persistence and ownership

PostgreSQL is the source of truth. Important persisted concepts include users, categories, transactions, budgets, import batches, category suggestions/feedback, intelligence findings/scans and historical-analysis snapshots.

Every private record is scoped by authenticated ownership. Seeded system categories are global/read-only; custom categories are account-owned.

`recurring-calendar-v1` and `spending-forecast-v1` are derived on request from the authenticated user's persisted transactions. Neither introduces another authoritative table or mutates source transactions.

Financial Assistant v1 also introduces **no assistant persistence table**. Questions, model turns, tool calls and assistant responses are not stored in PostgreSQL. `privacy-export-v1` therefore has no assistant-history collection in this version.

## Financial arithmetic

Money is stored as PostgreSQL `NUMERIC` and processed with Python `Decimal`. API v2 serializes money as decimal strings; the frontend avoids floating-point financial business arithmetic.

Recurring totals, three-month means, run-rate projections, recurrence-aware projections, MAE and signed monetary bias remain `Decimal` through the backend. sMAPE is dimensionless and serialized separately.

Financial Assistant period comparison follows the same rule: period expense totals, absolute difference, percentage change and category deltas are calculated server-side before the model sees evidence. The LLM is instructed to explain those values rather than recompute them.

## Actionable intelligence: `rules-v2`

`rules-v2` creates persisted reviewable findings using canonical merchant identity, recurring-stream segmentation, calendar/lifecycle evidence, `merchant_mad_plus_extreme_iqr_v1`, chronological frequency baselines and stable fingerprints.

Current types:

```text
recurring_pattern
recurring_payment_missing
duplicate_subscription
spending_anomaly
frequency_anomaly
```

Financial Assistant reads persisted findings. It does not invoke an intelligence scan as a side effect of a question.

## Historical diagnostics: `historical-v2.2`

Historical analysis is stored as versioned snapshots and remains separate from review-state findings. The current recurrence segmentation contract is `lifecycle-v1`.

It provides month completeness, trend, canonical merchant evidence, lifecycle/calendar-aware recurring profiles, chronological amount outliers, category shifts and coverage metadata.

Financial Assistant reads the latest persisted snapshot when asked for historical insights. It does not generate a new historical-analysis snapshot as a side effect of a question.

## Upcoming recurring payments: `recurring-calendar-v1`

```text
authenticated expense history
        |
        v
historical-v2.2 / lifecycle-v1
        |
        +--> next expected date / cadence
        +--> amount / price regime
        +--> lifecycle and missing evidence
        |
        v
recurring-calendar-v1
        |
        +--> future expected / likely / price_changed
        +--> separate overdue schedules
```

Monthly/quarterly/yearly projection preserves calendar alignment. Missing/dormant streams are not automatically rolled forward. Price-continuity streams project the latest observed price regime.

For normal product calendar requests the window begins at `asOf`. The internal projection primitive also permits a later `window_start` while keeping recurrence evidence frozen at `asOf`; `spending-forecast-v1` uses this causal boundary to project from the next day without same-day double counting.

## Month-end forecast: `spending-forecast-v1`

The forecast service loads the authenticated user's expense history and discards every row after the requested `asOf` before building any component.

```text
eligible transactions through asOf
        |
        +--> previous 3 complete months -> mean baseline
        |
        +--> current spend / elapsed calendar days -> run-rate baseline
        |
        +--> historical-v2.2 qualified recurring stream IDs
                  |
                  +--> recurring spend already observed
                  +--> non-recurring/variable spend numerator
                  |
                  +--> recurring-calendar-v1 future occurrences
        |
        v
recurrence-aware month-end baseline
```

The recurrence-aware formula is:

```text
spent_so_far
+ projected_remaining_variable_spend
+ future_qualified_recurring_spend
```

Already-observed recurring charges remain inside `spent_so_far` exactly once and are excluded from the variable numerator.

### Walk-forward evaluation

For each eligible complete historical month, the evaluator freezes data at day 15 and predicts that month's final total. A fold is accepted only when all three baselines are available, guaranteeing identical support. It reports:

- MAE;
- sMAPE;
- signed bias.

The dedicated `Spending forecast benchmark` workflow uses a deterministic fixture and blocks regressions in causal/support/metric behavior. A future ML forecasting challenger must beat these baselines on the same chronological folds/support before product promotion. See [`spending-forecast.md`](spending-forecast.md).

## Category suggestion architecture

Global contract:

```text
modelVersion  = tfidf-logreg-v1
featurePolicy = merchant_descriptor_only_v1
```

Runtime resolution is layered: latest compatible category from the authenticated user's canonical-merchant feedback first, otherwise the global classifier over active compatible system categories. Account-owned categories are never injected into the global taxonomy.

Preview does not mutate transactions or expose raw probabilities. V2 transaction writes recompute suggestion provenance and persist transaction + feedback atomically.

## Financial Assistant architecture

Financial Assistant v1 follows one non-negotiable boundary:

> The LLM reasons and explains. Backend domain services calculate and decide financial facts.

The public contract is:

```text
POST /api/v2/assistant/query
```

The request contains only a bounded `question`. Pydantic forbids unknown request fields; there is no `userId` field.

The orchestration flow is:

```text
current_user.id
      |
      +------------------------------+
                                     |
question -> FinancialAssistantService|
                |                    |
                v                    |
          LLMProvider                |
                | strict function    |
                v                    |
      FinancialAssistantTools <------+
                |
                +--> summarize_transactions
                +--> financial_comparison_service
                +--> budget_service
                +--> persisted intelligence_service reads
                +--> latest historical-v2.2 snapshot read
                +--> bounded list_transactions search
                |
                v
          evidence records
                |
                v
          LLM explanation
                |
                v
     backend evidence reconciliation
                |
                v
 answer + evidence + limitations + requestId
```

The six v1 tools are:

```text
get_financial_summary
compare_periods
get_budget_progress
get_financial_findings
get_historical_insights
search_transactions
```

Every tool is read-only. `user_id` is supplied by the orchestration layer from `current_user.id`, never from model arguments. Tool schemas use strict JSON Schema and reject extra properties.

### Evidence trust boundary

Executed tools emit canonical evidence records. The model may return references to those records in its structured final answer, but those references are not accepted blindly.

The backend constructs a request-local evidence catalog and performs final reconciliation:

```text
valid executed reference -> return canonical backend label
invented reference       -> drop it + add limitation
no valid selected evidence after tool use
                         -> surface executed canonical evidence + add limitation
```

This prevents a model-generated label/reference from becoming a trusted source merely because it appeared in structured LLM output.

### Provider boundary

Provider-specific code lives under `backend/app/integrations/llm/`. Domain services depend on a small `LLMProvider` protocol so tests use fakes without network calls.

The OpenAI implementation uses the Responses API with strict functions, structured JSON-Schema output, bounded tool rounds/calls/output tokens and `store=false`. It replays provider output/function results within the same HTTP request instead of creating application chat history.

The application starts without an LLM provider. If no `OPENAI_API_KEY` is configured, only the assistant endpoint returns the typed `503 financial_assistant_not_configured` error.

V1 deliberately omits LangChain/LangGraph/CrewAI, RAG, embeddings, vector storage, persistent conversation memory, autonomous financial writes and model routing.

### External-provider privacy boundary

Stateless application design is not equivalent to zero external processing. When OpenAI is configured, the question and bounded financial tool output required for the answer are sent to that provider. The application omits its internal authenticated user ID and does not persist local assistant threads, but deployment operators must evaluate the provider's current data-processing/retention terms.

See [`financial-assistant.md`](financial-assistant.md).

## Shared analysis contracts

Stable identifiers crossing implementation/documentation boundaries are defined in `backend/app/analysis_contracts.py`:

```text
rules-v2
historical-v2.2
recurring-calendar-v1
spending-forecast-v1
merchant_mad_plus_extreme_iqr_v1
isolation-forest-v1
causal-transaction-features-v1
rules-v2-or-isolation-forest-v1
lifecycle-v1
tfidf-logreg-v1
merchant_descriptor_only_v1
```

Algorithm-specific thresholds remain next to their owning implementation. Financial Assistant is an orchestration/product contract over these services rather than a new financial analysis algorithm identifier.

## Evaluation boundary

The evidence hierarchy is:

```text
unit/integration fixtures -> regression protection
financial-benchmark-v1 -> synthetic financial-development evidence
spending-forecast-benchmark-v1 -> deterministic forecast regression evidence
anomaly-challenger-benchmark-v1 -> causal rules-vs-ML regression evidence
private-real-data-v1 harness -> mechanism for private/independent evaluation
independent/real labelled results -> production-quality evidence
```

No synthetic metric is represented as real banking accuracy. Forecast error displayed by the product comes from the user's own available historical folds, while benchmark metrics exist only to protect implementation behavior.

The Financial Assistant is tested primarily as an orchestration/security/grounding contract: correct account scope, exact backend-produced financial facts, bounded tool behavior and evidence reconciliation. LLM eloquence is not treated as a substitute for deterministic fact verification.

## Deployment architecture

```text
Browser -> Nginx -> FastAPI ---------------------> PostgreSQL
                         |
                         +--> category suggestion runtime
                         +--> rules-v2
                         +--> historical-v2.2
                         +--> recurring-calendar-v1
                         +--> spending-forecast-v1
                         +--> Financial Assistant tools
                                   |
                                   +--> optional OpenAI Responses API
```

The external LLM provider is optional; all pre-existing financial product paths remain operational without it. Offline/private evaluators are not mounted or invoked by production Compose.
