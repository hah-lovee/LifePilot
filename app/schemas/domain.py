# app/schemas/domain.py
from pydantic import BaseModel

class DomainBase(BaseModel):
    name: str
    is_builtin: bool = False

class DomainCreate(DomainBase):
    pass

class DomainUpdate(DomainBase):
    pass

class DomainRead(DomainBase):
    id: int

    model_config = {
        "from_attributes": True  # Pydantic v2 вместо orm_mode
    }
