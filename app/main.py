from fastapi import FastAPI
from app.api.balance import router as balance_router
from app.api.domains import router as domains_router
from app.api.reports import router as reports_router

app = FastAPI()

app.include_router(balance_router)
app.include_router(domains_router)
app.include_router(reports_router)