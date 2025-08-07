from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.connection import get_async_session
from app.models.reporting.report import DailyReport, DailyRating
from app.schemas.report import ReportCreate, ReportUpdate

router = APIRouter(prefix="/reports", tags=["Daily Reports"])

@router.post("/")
async def create_report(report: ReportCreate, db: AsyncSession = Depends(get_async_session)):
    # расчет среднего балла
    scores = [r.score for r in report.ratings]
    avg_score = int(sum(scores) / len(scores)) if scores else 0

    new_report = DailyReport(
        user_id=report.user_id,
        date=report.date,
        summary_text=report.summary_text,
        productivity_score=avg_score
    )
    db.add(new_report)
    await db.flush()

    for r in report.ratings:
        db.add(DailyRating(
            user_id=report.user_id,
            report_id=new_report.id,
            domain_id=r.domain_id,
            score=r.score,
            comment=r.comment
        ))

    await db.commit()
    await db.refresh(new_report)
    return new_report

@router.get("/")
async def get_reports(user_id: int, db: AsyncSession = Depends(get_async_session)):
    result = await db.execute(select(DailyReport).where(DailyReport.user_id == user_id))
    return result.scalars().all()

@router.put("/{report_id}")
async def update_report(report_id: int, update: ReportUpdate, db: AsyncSession = Depends(get_async_session)):
    result = await db.execute(select(DailyReport).where(DailyReport.id == report_id))
    report = result.scalar_one_or_none()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    for field, value in update.dict(exclude_unset=True).items():
        setattr(report, field, value)

    await db.commit()
    await db.refresh(report)
    return report

@router.delete("/{report_id}")
async def delete_report(report_id: int, db: AsyncSession = Depends(get_async_session)):
    result = await db.execute(select(DailyReport).where(DailyReport.id == report_id))
    report = result.scalar_one_or_none()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    await db.delete(report)
    await db.commit()
    return {"ok": True}