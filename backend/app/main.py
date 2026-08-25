from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core.api_errors import (
    ApiError,
    api_error_handler,
    http_exception_handler,
    validation_exception_handler,
)
from app.core.config import settings
from app.core.http_security import SecurityMiddleware
from app.routers.analytics import router as analytics_router
from app.routers.analytics_v2 import router as analytics_v2_router
from app.routers.auth import router as auth_router
from app.routers.categories import router as categories_router
from app.routers.historical_analysis import router as historical_analysis_router
from app.routers.intelligence import router as intelligence_router
from app.routers.intelligence_v2 import router as intelligence_v2_router
from app.routers.transactions import router as transactions_router
from app.routers.transactions_v2 import router as transactions_v2_router


production_docs_disabled = settings.app_env == "production"
API_V1_PREFIX = "/api/v1"
API_V2_PREFIX = "/api/v2"

app = FastAPI(
    title="Smart Expense AI API",
    description="Versioned API for authenticated transaction management, analytics and explainable financial intelligence.",
    version="1.4.0",
    debug=settings.app_debug,
    docs_url=None if production_docs_disabled else "/docs",
    redoc_url=None if production_docs_disabled else "/redoc",
    openapi_url=None if production_docs_disabled else "/openapi.json",
)

app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)

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


app.include_router(auth_router, prefix=API_V1_PREFIX)
app.include_router(categories_router, prefix=API_V1_PREFIX)
app.include_router(transactions_router, prefix=API_V1_PREFIX)
app.include_router(analytics_router, prefix=API_V1_PREFIX)
app.include_router(intelligence_router, prefix=API_V1_PREFIX)

# API v2 starts with breaking monetary representation changes. Money is serialized
# as decimal strings so clients never need IEEE-754 for financial values.
app.include_router(transactions_v2_router, prefix=API_V2_PREFIX)
app.include_router(analytics_v2_router, prefix=API_V2_PREFIX)
app.include_router(intelligence_v2_router, prefix=API_V2_PREFIX)
app.include_router(historical_analysis_router, prefix=API_V2_PREFIX)