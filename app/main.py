from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


from app.api.balance import router as balance_router
from app.api.domains import router as domains_router
from app.api.reports import router as reports_router
from app.api.auth import router as auth_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(balance_router)
app.include_router(domains_router)
app.include_router(reports_router)
app.include_router(auth_router)