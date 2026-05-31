# Smart Expense AI Frontend

Frontend application for Smart Expense AI.

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router DOM
- Recharts
- Lucide React

## Getting Started

From the `frontend` directory:

```bash
npm install
npm run dev
```

The application will run by default at:

```txt
http://localhost:5173
```

## Available Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

## Pages

The frontend is structured as a single-page application using React Router.

| Route | Page | Purpose |
| --- | --- | --- |
| `/` | Dashboard | Main financial intelligence dashboard. |
| `/transactions` | Transactions | Transaction review and category summary. |
| `/predictions` | Predictions | Spending forecast and recurring charge estimates. |
| `/alerts` | Alerts | Anomaly and duplicated subscription monitoring. |
| `/security` | Security | Privacy, authentication and data protection planning. |

## Current Status

The current version contains:

- Sidebar navigation with active route state.
- Real application routing.
- Dashboard page.
- Transactions page.
- Predictions page.
- Alerts page.
- Security page.
- Reusable layout components.
- Reusable dashboard components.
- Mock data prepared for future API integration.

## Project Structure

```txt
src/
├── components/
│   ├── dashboard/
│   ├── layout/
│   └── ui/
├── data/
├── pages/
├── routes/
├── styles/
├── types/
├── utils/
├── App.tsx
└── main.tsx
```

## Next Frontend Steps

- Add authentication screens.
- Add transaction creation and edit forms.
- Add page-level loading and error states.
- Connect to the FastAPI backend.
- Replace mock data with API services.
- Add form validation.
