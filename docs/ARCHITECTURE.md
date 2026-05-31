# Architecture

## Overview

Smart Expense AI is planned as a modular web application composed of four main areas:

1. Frontend web application.
2. Backend API.
3. Database and persistence layer.
4. AI and analytics services.

The initial architecture should stay simple enough for an MVP, but structured in a way that allows future growth.

## Proposed High-Level Architecture

```txt
User
 │
 ▼
Frontend Web App
 │
 ▼
Backend API
 ├── Authentication
 ├── Transaction Management
 ├── Category Management
 ├── Dashboard Data
 ├── Alert Engine
 └── AI Analysis Orchestrator
 │
 ▼
Database
 │
 ▼
AI / Analytics Layer
 ├── Categorization
 ├── Pattern Detection
 ├── Forecasting
 └── Anomaly Detection
```

## Frontend

The frontend should provide a clean and simple financial dashboard.

Expected sections:

- Login and registration.
- Main dashboard.
- Transaction list.
- Transaction form.
- Category summary.
- Alerts and insights panel.
- Predictions view.

Possible stack:

- React.
- TypeScript.
- Tailwind CSS.
- Charting library for visualizations.

## Backend

The backend should expose a REST API for the frontend and coordinate business logic.

Possible stack:

- Python.
- FastAPI.
- SQLAlchemy.
- Pydantic.
- PostgreSQL.

Main responsibilities:

- User authentication.
- Transaction CRUD.
- Category management.
- Financial summaries.
- Alert generation.
- AI analysis execution.

## Database

The first database model should be focused on clarity and future expansion.

Initial entities:

- User.
- Transaction.
- Category.
- Merchant.
- RecurringExpense.
- Alert.
- Insight.

## AI and Analytics Layer

The AI layer should start with deterministic and statistical logic before moving into complex models.

### Phase 1

- Rule-based categorization.
- Historical averages.
- Recurring transaction detection by merchant, amount and frequency.
- Simple anomaly thresholds.

### Phase 2

- Machine learning assisted categorization.
- Better anomaly scoring.
- Time-series forecasting.
- Personalized spending baselines.

### Phase 3

- Natural-language financial assistant.
- Advanced recommendations.
- Multi-account behavioral analysis.

## Suggested API Modules

```txt
backend/
├── app/
│   ├── api/
│   │   ├── routes_auth.py
│   │   ├── routes_transactions.py
│   │   ├── routes_categories.py
│   │   ├── routes_dashboard.py
│   │   └── routes_alerts.py
│   ├── core/
│   │   ├── config.py
│   │   └── security.py
│   ├── models/
│   ├── schemas/
│   ├── services/
│   ├── ai/
│   └── main.py
└── tests/
```

## Security Principles

Because the application handles financial information, security must be considered from the beginning.

Initial principles:

- Password hashing.
- JWT or secure session handling.
- Environment-based secrets.
- No sensitive data in logs.
- Input validation.
- Authorization checks per user.
- Data isolation between users.

## Data Privacy Principles

- Store the minimum amount of personal data required.
- Avoid storing bank credentials directly.
- Keep transaction data private by default.
- Provide future export and deletion options.
- Prepare the project for GDPR-oriented decisions if the product becomes real.

## MVP Technical Strategy

For the MVP, the project should avoid unnecessary complexity.

Recommended approach:

1. Start with manual transaction input.
2. Add database persistence.
3. Add dashboards and summaries.
4. Add rule-based recurring expense detection.
5. Add simple anomaly detection.
6. Add predictive estimates based on historical averages.
7. Improve the AI layer only after real sample data exists.

## Future Integrations

Possible future integrations:

- Bank aggregation APIs.
- Email receipt analysis.
- Push notifications.
- Stripe for subscriptions.
- OpenAI or local LLM-based insight generation.
- Mobile app.
