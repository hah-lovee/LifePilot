# from sqlalchemy.ext.asyncio import AsyncGenerator, AsyncSession, create_async_engine
# from sqlalchemy.orm import sessionmaker
# import os
# from dotenv import load_dotenv

# load_dotenv()

# REPORT_DATABASE_URL = os.getenv("REPORT_DATABASE_URL")

# engine = create_async_engine(
#     REPORT_DATABASE_URL,
#     echo=True,
# )

# SessionLocal = sessionmaker(
#     bind=engine,
#     class_=AsyncSession,
#     expire_on_commit=False,
# )

# async def get_db() -> AsyncGenerator[AsyncSession, None]:
#     async with SessionLocal() as session:
#         yield session

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, AsyncGenerator
from sqlalchemy.orm import sessionmaker
import os

# REPORTING DB
REPORT_DATABASE_URL = os.getenv("REPORT_DATABASE_URL")
report_engine = create_async_engine(REPORT_DATABASE_URL, echo=True)
ReportSessionLocal = sessionmaker(report_engine, class_=AsyncSession, expire_on_commit=False)

# AUTH DB
AUTH_DATABASE_URL = os.getenv("AUTH_DATABASE_URL")
auth_engine = create_async_engine(AUTH_DATABASE_URL, echo=True)
AuthSessionLocal = sessionmaker(auth_engine, class_=AsyncSession, expire_on_commit=False)

# Зависимости
async def get_report_session() ->  AsyncGenerator[AsyncSession, None]:
    async with ReportSessionLocal() as session:
        yield session

async def get_auth_session() ->  AsyncGenerator[AsyncSession, None]:
    async with AuthSessionLocal() as session:
        yield session