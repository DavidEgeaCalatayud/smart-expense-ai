from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings
from app.core.http_security import SecurityMiddleware
from app.routers.auth import router as auth_router
from app.routers.categories import router as categories_router
from app.routers.transactions import router as transactions_router


production_docs_disabled = settings.app_env == "production"

app = FastAPI(
    title="Smart Expense AI API",
    description="Backend API for authenticated Smart Expense AI transaction management and future analysis.",
    version="0.3.0",
    debug=settings.app_debug,
    docs_url=None if production_docs_disabled else "/docs",
    redoc_url=None if production_docs_disabled else "/redoc",
    openapi_url=None if production_docs_disabled else "/openapi.json",
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_host_list,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)
app.add_middleware(SecurityMiddleware)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router, prefix="/api")
app.include_router(categories_router, prefix="/api")
app.include_router(transactions_router, prefix="/api")
