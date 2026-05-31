# Smart Expense AI

**Smart Expense AI** is a personal finance application that uses artificial intelligence to analyze purchases, detect spending patterns, predict future expenses and alert users about financial anomalies.

The objective is not only to classify transactions, but to help users understand their financial behavior and anticipate problems before they happen.

## Project Idea

Most expense tracking tools are focused on manual tracking or simple automatic categorization. Smart Expense AI is designed to go one step further by combining transaction analysis, predictive models and automatic alerting.

The application should be able to answer questions such as:

- Am I spending more than usual this month?
- Which categories are growing without me noticing?
- Do I have duplicated subscriptions?
- Are there suspicious or unexpected charges?
- How much am I likely to spend by the end of the month?
- What expenses could I reduce without changing my lifestyle too much?

## Main Features

### Expense Analysis

- Automatic transaction categorization.
- Monthly and weekly spending summaries.
- Category-based expense breakdown.
- Recurring expense detection.
- Income vs expense comparison.

### AI-Based Pattern Detection

- Identification of spending habits.
- Detection of unusual behavior compared with previous months.
- Recognition of recurring purchases and subscriptions.
- Analysis of spending peaks by day, week or category.

### Predictive Expense Forecasting

- Estimation of future monthly spending.
- Projection of end-of-month balance.
- Prediction of recurring charges.
- Early warning when expected spending exceeds normal limits.

### Anomaly Alerts

- Duplicate subscription detection.
- Suspicious charge alerts.
- Unexpected price increases in recurring payments.
- Unusual category spending.
- Notifications for abnormal transaction amounts.

## Differential Value

The main differentiator of Smart Expense AI is that it does not stop at transaction categorization.

It aims to provide:

- Predictive analysis.
- Automatic anomaly detection.
- Personalized financial insights.
- Proactive alerts.
- Clear recommendations based on real spending behavior.

Instead of only showing what has already happened, the application should help the user understand what is likely to happen next.

## Business Model

The intended business model is a **freemium SaaS model** with a monthly premium subscription.

### Free Plan

Possible features:

- Manual expense entry.
- Basic categorization.
- Monthly summary.
- Limited number of transactions.

### Premium Plan

Possible features:

- AI-powered predictions.
- Anomaly detection.
- Subscription monitoring.
- Advanced dashboards.
- Automatic alerts.
- Bank account integrations.
- Exportable reports.
- Personalized financial recommendations.

## Possible Tech Stack

This stack may evolve as the project grows.

### Frontend

- React
- TypeScript
- Tailwind CSS
- Charting library for financial dashboards

### Backend

- Python
- FastAPI
- PostgreSQL
- Redis for background tasks and scheduled analysis

### AI and Data Analysis

- Transaction classification model
- Time-series forecasting
- Anomaly detection algorithms
- Pattern recognition over historical transactions

### Infrastructure

- Docker
- GitHub Actions
- Cloud deployment provider to be defined

## Initial Architecture

```txt
smart-expense-ai/
├── frontend/        # Web interface
├── backend/         # API and business logic
├── ai/              # Prediction and anomaly detection models
├── docs/            # Product and technical documentation
├── scripts/         # Utility scripts
└── README.md
```

## Product Roadmap

### Phase 1 - MVP

- Define the transaction data model.
- Create basic expense CRUD.
- Add manual transaction categorization.
- Build a basic dashboard.
- Add monthly summary reports.

### Phase 2 - Intelligence Layer

- Add automatic categorization.
- Detect recurring expenses.
- Detect duplicated subscriptions.
- Add basic anomaly detection.

### Phase 3 - Predictive Layer

- Predict end-of-month spending.
- Estimate future recurring charges.
- Add warning thresholds.
- Generate personalized insights.

### Phase 4 - Premium SaaS

- Add authentication.
- Add subscription plans.
- Add premium-only AI features.
- Add exportable reports.
- Prepare production deployment.

## Example Use Cases

### Duplicate Subscription

The system detects that the user is paying for two similar services in the same category and generates an alert.

### Suspicious Charge

The system detects a payment that is much higher than the user's normal spending pattern and marks it as suspicious.

### Predictive Warning

The system estimates that the user will exceed their usual monthly spending by the end of the month and sends an early warning.

### Category Overspending

The system detects that restaurant spending has increased by 40% compared with the previous month and notifies the user.

## Current Status

Project initialized.

The next step is to define the technical architecture, create the initial folder structure and start building the MVP.

## Author

Developed by [DavidEgeaCalatayud](https://github.com/DavidEgeaCalatayud).
