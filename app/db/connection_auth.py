from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from typing import AsyncGenerator
import os

AUTH_DATABASE_URL = os.getenv("AUTH_DATABASE_URL")

auth_engine = create_async_engine(
    AUTH_DATABASE_URL,
    echo=True,
    connect_args={"ssl": False}
)
AuthSessionLocal = sessionmaker(auth_engine, class_=AsyncSession, expire_on_commit=False)

async def get_auth_session() -> AsyncGenerator[AsyncSession, None]:
    async with AuthSessionLocal() as session:
        yield session
