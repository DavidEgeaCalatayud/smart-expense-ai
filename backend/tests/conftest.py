import os


DEFAULT_TEST_DATABASE_URL = (
    "postgresql+psycopg://postgres:postgres@localhost:5432/smart_expense_ai_test"
)

# Tests never inherit development secrets or database URLs implicitly.
os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)
os.environ["JWT_SECRET"] = "test-only-smart-expense-jwt-secret"
os.environ["AUTH_COOKIE_SECURE"] = "false"
