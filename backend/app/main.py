import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.modules.admin.router import router as admin_router
from app.modules.auth.router import router as auth_router
from app.modules.diary.router import router as diary_router
from app.modules.habits.router import router as habits_router
from app.modules.investments.router import router as investments_router
from app.modules.investments.scheduler import start_scheduler, stop_scheduler
from app.modules.reports.router import router as reports_router
from app.modules.sport.router import router as sport_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")

app.include_router(auth_router)
app.include_router(habits_router)
app.include_router(diary_router)
app.include_router(reports_router)
app.include_router(sport_router)
app.include_router(admin_router)
app.include_router(investments_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
