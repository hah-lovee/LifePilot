from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.investments import client
from app.modules.investments.schemas import (
    AssetDetail,
    ConnectBrokerRequest,
    ConnectExchangeRequest,
    DiversificationBreakdown,
    DividendEvent,
    InvestmentsSummary,
    MonthlyIncome,
    NetWorthPoint,
    SectorDetail,
)
from app.modules.investments.service import (
    aggregate_monthly_income,
    compute_asset_detail,
    compute_diversification,
    get_net_worth_history,
    get_sector_detail,
)

router = APIRouter(prefix="/api/investments", tags=["investments"])


@router.post("/exchanges", status_code=201)
def connect_exchange(payload: ConnectExchangeRequest, user: User = Depends(get_current_user)) -> dict:
    return client.connect_exchange(str(user.id), payload.exchange, payload.api_key, payload.secret_key, payload.passphrase)


@router.put("/exchanges")
def update_exchange(payload: ConnectExchangeRequest, user: User = Depends(get_current_user)) -> dict:
    return client.update_exchange(str(user.id), payload.exchange, payload.api_key, payload.secret_key, payload.passphrase)


@router.delete("/exchanges/{exchange}", status_code=204)
def delete_exchange(exchange: str, user: User = Depends(get_current_user)) -> None:
    client.delete_exchange(str(user.id), exchange)


@router.post("/brokers", status_code=201)
def connect_broker(payload: ConnectBrokerRequest, user: User = Depends(get_current_user)) -> dict:
    return client.connect_broker(str(user.id), payload.broker, payload.token, payload.account_id)


@router.put("/brokers")
def update_broker(payload: ConnectBrokerRequest, user: User = Depends(get_current_user)) -> dict:
    return client.update_broker(str(user.id), payload.broker, payload.token, payload.account_id)


@router.delete("/brokers/{broker}", status_code=204)
def delete_broker(broker: str, user: User = Depends(get_current_user)) -> None:
    client.delete_broker(str(user.id), broker)


@router.get("/summary", response_model=InvestmentsSummary)
def get_summary(user: User = Depends(get_current_user)) -> dict:
    balances = client.get_balances(str(user.id))
    if balances is None:
        return {"crypto": [], "brokers": []}
    return {"crypto": balances["crypto"], "brokers": balances["brokers"]}


@router.get("/net-worth", response_model=list[NetWorthPoint])
def get_net_worth(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[NetWorthPoint]:
    snapshots = get_net_worth_history(db, user.id, date_from, date_to)
    return [
        NetWorthPoint(
            snapshot_date=s.snapshot_date,
            total_value_rub=s.total_value_rub,
            crypto_value_rub=s.crypto_value_rub,
            broker_value_rub=s.broker_value_rub,
            invested_amount_rub=s.invested_amount_rub,
            dividends_received_rub=s.dividends_received_rub,
        )
        for s in snapshots
    ]


@router.get("/diversification", response_model=DiversificationBreakdown)
def get_diversification(user: User = Depends(get_current_user)) -> DiversificationBreakdown:
    balances = client.get_balances(str(user.id)) or {"crypto": [], "brokers": []}
    rates = client.get_rates()
    return compute_diversification(balances, rates["usd_rub"])


@router.get("/diversification/sector/{sector}", response_model=SectorDetail)
def get_sector(sector: str, user: User = Depends(get_current_user)) -> SectorDetail:
    balances = client.get_balances(str(user.id)) or {"crypto": [], "brokers": []}
    rates = client.get_rates()
    return get_sector_detail(balances, rates["usd_rub"], sector)


@router.get("/dividends", response_model=list[DividendEvent])
def get_dividends(lookahead_days: int = 365, user: User = Depends(get_current_user)) -> list[dict]:
    return client.get_dividends(str(user.id), lookahead_days)


@router.get("/dividends/monthly", response_model=list[MonthlyIncome])
def get_dividends_monthly(user: User = Depends(get_current_user)) -> list[MonthlyIncome]:
    dividends = client.get_dividends(str(user.id), lookahead_days=365)
    return aggregate_monthly_income(dividends)


@router.get("/assets/{ticker}", response_model=AssetDetail)
def get_asset(ticker: str, user: User = Depends(get_current_user)) -> AssetDetail:
    balances = client.get_balances(str(user.id)) or {"crypto": [], "brokers": []}
    dividends = client.get_dividends(str(user.id), lookahead_days=365)
    rates = client.get_rates()
    detail = compute_asset_detail(ticker, balances, dividends, rates["usd_rub"])
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Актив не найден в портфеле")
    return detail
