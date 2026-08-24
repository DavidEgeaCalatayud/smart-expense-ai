# Roadmap

## Phase 0 - Project Foundation

Goal: prepare the repository and define the product direction.

- [x] Create repository.
- [x] Add README and product documentation.
- [x] Define the current technical stack.
- [x] Create backend base project with FastAPI.
- [x] Create frontend base project with React and TypeScript.
- [x] Add environment configuration.
- [x] Add Docker configuration.

## Phase 1 - Persistent MVP Core

Goal: make the first usable version persist real financial data.

- [x] Define transaction and category models.
- [x] Add PostgreSQL persistence with SQLAlchemy 2.
- [x] Add Alembic migrations.
- [x] Seed initial categories.
- [x] Create transaction CRUD endpoints.
- [x] Connect Transactions page to the REST API.
- [x] Load categories from the backend.
- [x] Validate category/type compatibility.
- [x] Remove transaction/category frontend mocks.
- [x] Build dashboard metrics from persisted transactions.
- [x] Build six-month expense chart from persisted transactions.
- [x] Show recent persisted transactions.
- [x] Add transparent rule-based review for high-value expenses.
- [ ] Improve responsive transaction UX.
- [x] Add delete confirmation and operation feedback.
- [ ] Add user-managed category CRUD when needed.

## Phase 2 - Accounts and Data Ownership

Goal: isolate financial data by user before adding sensitive integrations.

- [ ] User registration.
- [ ] User login.
- [ ] Authentication/session strategy.
- [ ] Add user ownership to transactions.
- [ ] Add user ownership to categories where applicable.
- [ ] Enforce per-user authorization in every endpoint.
- [ ] Add account and privacy controls.

## Phase 3 - Financial Intelligence

Goal: implement real analysis without simulated AI outputs.

- [ ] Detect recurring transactions from historical data.
- [ ] Detect duplicated subscriptions.
- [ ] Detect abnormal transaction amounts.
- [ ] Add persisted alert entities and review workflow.
- [ ] Add alert severity levels.
- [ ] Generate explainable financial insights.
- [ ] Validate analysis rules against real datasets.

## Phase 4 - Prediction

Goal: estimate future spending and provide proactive warnings.

- [ ] Predict end-of-month spending.
- [ ] Predict recurring charges.
- [ ] Compare predicted spending with historical averages.
- [ ] Add warning thresholds.
- [ ] Add category-level spending forecasts.
- [ ] Expose prediction evidence and assumptions.
- [ ] Add model evaluation before displaying confidence metrics.

## Phase 5 - Premium SaaS Preparation

Goal: prepare the project for a subscription-based model.

- [ ] Define free and premium limits.
- [ ] Add premium feature flags.
- [ ] Add subscription-ready user model.
- [ ] Add payment provider research.
- [ ] Add exportable reports.
- [ ] Add advanced insights.

## Phase 6 - Production Readiness

Goal: prepare the application for real deployment.

- [x] Add backend automated tests.
- [x] Add frontend automated tests.
- [x] Add GitHub Actions CI.
- [x] Run frontend tests, type checking, build and lint in CI.
- [x] Validate Alembic migrations against PostgreSQL in CI.
- [x] Add critical Playwright end-to-end coverage.
- [x] Add Docker Compose.
- [x] Validate the full Docker Compose stack in CI.
- [ ] Configure `Quality gate` as a required check for `main`.
- [ ] Add staging deployment.
- [ ] Add production configuration.
- [ ] Add security review.
- [ ] Add privacy policy draft.

## Long-Term Ideas

- Bank account integration.
- Email receipt analysis.
- Mobile application.
- AI chat assistant for financial questions.
- Multi-currency support.
- Shared household accounts.
- Budget recommendations.
- Goal-based saving plans.
