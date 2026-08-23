import os


DEFAULT_TEST_DATABASE_URL = (
    "postgresql+psycopg://postgres:postgres@localhost:5432/smart_expense_ai_test"
)

# Tests never inherit the development DATABASE_URL implicitly. Use
# TEST_DATABASE_URL to point the suite at an explicit disposable database.
os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)
