# app/api/auth.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext

from app.db.connection_auth import get_auth_session
# from app.models.auth import user
from app.schemas.auth import UserLogin, TokenResponse, UserCreate
from app.models.auth import AuthUser

router = APIRouter(prefix="/auth", tags=["Auth"])

SECRET_KEY = "your-secret-key"  # вынеси в .env
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

@router.post("/login", response_model=TokenResponse)
async def login(user: UserLogin, db: AsyncSession = Depends(get_auth_session)):
    result = await db.execute(select(AuthUser).where(AuthUser.username == user.username))
    db_user = result.scalar_one_or_none()

    if not db_user or not verify_password(user.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token({"sub": str(db_user.id)})
    return TokenResponse(access_token=access_token)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(user: UserCreate, db: AsyncSession = Depends(get_auth_session)):
    result = await db.execute(
        select(AuthUser).where(
            (AuthUser.username == user.username) | (AuthUser.email == user.email)
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Пользователь с таким username или email уже существует")

    new_user = AuthUser(
        username=user.username,
        email=user.email,
        password_hash=hash_password(user.password)
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    access_token = create_access_token({"sub": str(new_user.id)})
    return TokenResponse(access_token=access_token)