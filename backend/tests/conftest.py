import os


DEFAULT_TEST_DATABASE_URL = (
    "postgresql+psycopg://postgres:postgres@localhost:5432/smart_expense_ai_test"
)

# Tests never inherit development secrets or database URLs implicitly.
os.environ["APP_ENV"] = "test"
os.environ["APP_DEBUG"] = "false"
os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)
os.environ["JWT_SECRET"] = "test-only-smart-expense-jwt-secret"
os.environ["JWT_ISSUER"] = "smart-expense-ai"
os.environ["JWT_AUDIENCE"] = "smart-expense-ai-web"
os.environ["AUTH_COOKIE_SECURE"] = "false"
os.environ["FRONTEND_ORIGIN"] = "http://localhost:5173"
os.environ["ALLOWED_HOSTS"] = "localhost,127.0.0.1,testserver"
