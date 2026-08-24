from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.auth import router as auth_router
from app.routers.categories import router as categories_router
from app.routers.transactions import router as transactions_router

app = FastAPI(
    title="Smart Expense AI API",
    description="Backend API for authenticated Smart Expense AI transaction management and future analysis.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router, prefix="/api")
app.include_router(categories_router, prefix="/api")
app.include_router(transactions_router, prefix="/api")
