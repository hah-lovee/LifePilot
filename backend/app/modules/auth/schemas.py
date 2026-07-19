from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=8)
    invite_code: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    name: str
    is_admin: bool
    timezone: str

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    timezone: str | None = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
