from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from typing import AsyncGenerator
import os

REPORT_DATABASE_URL = os.getenv("REPORT_DATABASE_URL")

report_engine = create_async_engine(
    REPORT_DATABASE_URL,
    echo=True,
    connect_args={"ssl": False}
)
ReportSessionLocal = sessionmaker(report_engine, class_=AsyncSession, expire_on_commit=False)

async def get_report_session() -> AsyncGenerator[AsyncSession, None]:
    async with ReportSessionLocal() as session:
        yield session
