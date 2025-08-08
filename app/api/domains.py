# app/api/domains.py

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.connection_reporting import get_report_session
from app.models.reporting.domain import Domain as DomainModel
from app.schemas.domain import DomainCreate, DomainUpdate, DomainRead

router = APIRouter(prefix="/domains", tags=["Domains"])


@router.post("/", response_model=DomainRead)
async def create_domain(
    domain: DomainCreate,
    db: AsyncSession = Depends(get_report_session)
):
    new_domain = DomainModel(
        name=domain.name,
        is_builtin=domain.is_builtin
    )
    db.add(new_domain)
    await db.commit()
    await db.refresh(new_domain)
    return new_domain


@router.get("/", response_model=List[DomainRead])
async def list_domains(
    db: AsyncSession = Depends(get_report_session)
):
    result = await db.execute(select(DomainModel))
    return result.scalars().all()


@router.get("/{domain_id}", response_model=DomainRead)
async def get_domain(
    domain_id: int,
    db: AsyncSession = Depends(get_report_session)
):
    result = await db.execute(
        select(DomainModel).where(DomainModel.id == domain_id)
    )
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(status_code=404, detail="Domain not found")
    return domain


@router.put("/{domain_id}", response_model=DomainRead)
async def update_domain(
    domain_id: int,
    domain_update: DomainUpdate,
    db: AsyncSession = Depends(get_report_session)
):
    result = await db.execute(
        select(DomainModel).where(DomainModel.id == domain_id)
    )
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(status_code=404, detail="Domain not found")
    domain.name = domain_update.name
    domain.is_builtin = domain_update.is_builtin
    await db.commit()
    await db.refresh(domain)
    return domain


@router.delete("/{domain_id}")
async def delete_domain(
    domain_id: int,
    db: AsyncSession = Depends(get_report_session)
):
    result = await db.execute(
        select(DomainModel).where(DomainModel.id == domain_id)
    )
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(status_code=404, detail="Domain not found")
    await db.delete(domain)
    await db.commit()
    return {"detail": "Domain deleted"}
