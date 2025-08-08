from pydantic import BaseModel
from datetime import date

class DomainRatingInput(BaseModel):
    domain_id: int
    score: int
    comment: str | None = None

class ReportCreate(BaseModel):
    user_id: int
    date: date
    summary_text: str | None = None
    ratings: list[DomainRatingInput]

class ReportUpdate(BaseModel):
    summary_text: str | None = None
    productivity_score: int | None = None