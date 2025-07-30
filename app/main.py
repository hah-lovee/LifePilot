from fastapi import FastAPI
from app.api.balance import router as balance_router

app = FastAPI()

app.include_router(balance_router)