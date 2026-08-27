# Financial Assistant v1

## Purpose

Financial Assistant v1 adds natural-language access to Smart Expense AI without making the language model a financial source of truth.

> The LLM reasons and explains. Backend domain services calculate and decide financial facts.

The assistant is intentionally small and stateless: one authenticated question, a bounded read-only tool loop, a structured answer, canonical evidence references and no persistent conversation history.

## Product flow

```text
Authenticated user question
        |
        v
POST /api/v2/assistant/query
        |
        v
FinancialAssistantService
        |
        +--> configured LLM provider
        |       |
        |       +--> strict function call(s)
        |               |
        |               v
        |       FinancialAssistantTools
        |               |
        |               +--> transaction analytics / exact Decimal comparison
        |               +--> BudgetService
        |               +--> persisted rules-v2 findings
        |               +--> persisted historical-v2.2 snapshot
        |               +--> bounded transaction search
        |               |
        |               v
        |           evidence JSON
        |               |
        +<--------------+
        |
        v
structured answer draft
        |
        v
backend evidence whitelist / canonical labels
        |
        v
answer + evidence + limitations + requestId
```

The browser renders the answer and evidence. It does not calculate financial deltas, budget progress, anomaly policy or historical trends.

## Endpoint

```text
POST /api/v2/assistant/query
```

Request:

```json
{
  "question": "Why did I spend more this month?"
}
```

`FinancialAssistantQuery` rejects unknown fields. In particular, `userId` is not accepted by the HTTP contract.

Representative response:

```json
{
  "answer": "You spent 273.35 EUR more than the comparison month...",
  "evidence": [
    {
      "source": "period_comparison",
      "reference": "2026-07_vs_2026-08",
      "label": "2026-07 vs 2026-08 expense comparison"
    }
  ],
  "limitations": [],
  "requestId": "..."
}
```

The assistant endpoint requires the normal authenticated session. The backend always obtains scope from `current_user.id` and passes that identity directly to domain/tool execution; it is not represented in the LLM tool schemas.

## Read-only tools

V1 exposes exactly six bounded tools:

| Tool | Source of truth | Notes |
| --- | --- | --- |
| `get_financial_summary` | `transaction_service.summarize_transactions` | exact income, expense, balance and counts for an optional date range |
| `compare_periods` | `financial_comparison_service` + transaction data | server-computed month totals, Decimal difference, percentage change and category deltas |
| `get_budget_progress` | `budget_service.get_budget_month` | server-computed spent, remaining, percentage, days remaining and over-budget state |
| `get_financial_findings` | persisted `rules-v2` findings | read-only; does not trigger an intelligence scan |
| `get_historical_insights` | latest persisted `historical-v2.2` snapshot | read-only; does not create a historical snapshot |
| `search_transactions` | `transaction_service.list_transactions` | bounded to at most 50 user-scoped rows |

Every provider function schema uses strict JSON Schema, requires every declared property and sets `additionalProperties=false`. Optional concepts are explicit nullable values rather than undeclared fields.

There is no tool argument named `userId`, `user_id` or equivalent. Runtime validation also rejects a model-supplied identity key even if a provider violated the declared schema.

## Exact financial arithmetic

The model is instructed not to calculate monetary differences, percentages, budget progress or category deltas. Those facts are already computed in backend services.

For example, `compare_periods` returns a fact object such as:

```json
{
  "periodA": {
    "label": "2026-07",
    "expenses": "1740.39"
  },
  "periodB": {
    "label": "2026-08",
    "expenses": "2013.74"
  },
  "difference": "273.35",
  "differencePercent": "15.70",
  "topCategoryChanges": [
    {
      "category": "Restaurants",
      "periodAExpenses": "...",
      "periodBExpenses": "...",
      "difference": "96.40"
    }
  ]
}
```

Database aggregation remains user-scoped and financial arithmetic remains PostgreSQL `NUMERIC` / Python `Decimal`. The LLM's job is to explain the supplied values, not recompute them.

## Evidence grounding

Tool outputs include canonical evidence records. The model may select which executed records support its final answer, but it cannot create a new trusted reference.

The backend builds an evidence catalog from actually executed tool outputs and resolves the model's final `(source, reference)` pairs against that catalog:

```text
model references executed evidence -> canonical evidence is returned
model invents an evidence reference -> reference is dropped + limitation is added
model executes financial tools but selects no valid evidence -> executed evidence is surfaced + limitation is added
```

Labels displayed by the UI come from backend tool execution, not from free-form model output.

This protects the product from presenting an invented `budget:2099-01`, historical snapshot or transaction search as a verified source.

## Provider boundary

Provider-specific code lives under:

```text
backend/app/integrations/llm/
```

The financial domain and router depend on the small `LLMProvider` protocol. Tests inject fake providers and therefore do not require network calls or an OpenAI API key.

The OpenAI adapter uses the Responses API with:

- strict function schemas;
- structured JSON-Schema final output;
- configurable model (default `gpt-5.6-terra`);
- configurable reasoning effort (default `low`);
- bounded output tokens;
- `store=false`;
- manual replay of provider output items/function outputs inside the single application request.

The application does not use LangChain, LangGraph, CrewAI, multi-agent routing, embeddings or a vector database in v1.

## Statelessness and privacy boundary

Smart Expense AI does not persist Financial Assistant questions, responses, tool calls or chat threads in PostgreSQL. There is therefore no assistant history to include in `privacy-export-v1` or account deletion.

`store=false` means this application does not rely on a stored Responses API object for conversational state. It does **not** mean that configuring an external provider prevents that provider from processing the data sent to it.

When OpenAI is configured, the provider receives the user question and the bounded financial tool outputs needed for the answer. The application deliberately omits the internal authenticated user ID from provider tool schemas/context, but transaction merchants, amounts, budgets or findings may still appear in tool output when needed to answer the question. Deployment operators must evaluate the provider's current data-processing/retention terms for their environment.

The implementation does not log raw assistant prompts, tool evidence or model responses.

## Configuration

The rest of Smart Expense AI remains operational when no LLM provider is configured. In that state, the assistant endpoint returns:

```text
503 financial_assistant_not_configured
```

Backend environment variables:

```text
OPENAI_API_KEY=
FINANCIAL_ASSISTANT_MODEL=gpt-5.6-terra
FINANCIAL_ASSISTANT_REASONING_EFFORT=low
FINANCIAL_ASSISTANT_MAX_TOOL_ROUNDS=5
FINANCIAL_ASSISTANT_MAX_TOOL_CALLS=12
FINANCIAL_ASSISTANT_MAX_OUTPUT_TOKENS=1600
```

`compose.yaml` forwards the same settings only to the backend container; no OpenAI credential is compiled into or exposed to the frontend.

## Failure and limit behavior

The tool loop is bounded to five rounds and twelve total tool calls by default. Configuration can change those positive limits without changing the HTTP contract.

Normalized API errors include:

```text
financial_assistant_not_configured  503
financial_assistant_tool_limit      502
financial_assistant_provider_error  502
```

Invalid HTTP payloads continue to use the standard `422 validation_error` envelope.

## V1 non-goals

Financial Assistant v1 deliberately does not add:

- persistent threads or chat history;
- user/profile memory;
- RAG or embeddings;
- a vector database;
- autonomous financial mutations/actions;
- multi-agent orchestration;
- model routing between inexpensive/expensive models;
- automatic intelligence scans or historical-analysis generation as side effects of questions.

Those capabilities should only be introduced if product evidence justifies the additional privacy, evaluation and operational complexity.

## Verification

Automated coverage protects:

- no user identity field in any strict tool schema;
- backend-owned user scope during tool execution;
- cross-account isolation for period comparison;
- Decimal comparison facts;
- filtering of model-invented evidence references;
- canonical evidence fallback;
- authentication and provider-unavailable errors;
- protected frontend workspace and structured answer rendering;
- browser POST body containing only `question`;
- the full existing backend/frontend/E2E/Docker/security/benchmark/SBOM gates.
