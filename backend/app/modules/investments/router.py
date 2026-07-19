from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
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
    ManualCryptoTradeCreate,
    ManualCryptoTradeOut,
    MonthlyIncome,
    NetWorthPoint,
    SectorDetail,
    UnifiedCryptoTrade,
)
from app.modules.investments import cache as inv_cache
from app.modules.investments.models import ManualCryptoTrade
from app.modules.investments.service import (
    aggregate_monthly_income,
    apply_manual_cost_basis,
    compute_asset_detail,
    compute_diversification,
    delete_manual_trade,
    get_net_worth_history,
    get_sector_detail,
    get_unified_trade_history,
    list_manual_trades,
    save_snapshot,
)

_BALANCES_TTL = 300.0    # 5 мин
_DIVIDENDS_TTL = 1800.0  # 30 мин
_RATES_TTL = 3600.0      # 1 час — CBR обновляет курс раз в день
_snapshot_saved_today: dict[int, str] = {}


def _rates() -> dict:
    key = "rates"
    cached = inv_cache.get(key, _RATES_TTL)
    if cached is not None:
        return cached
    data = client.get_rates()
    inv_cache.put(key, data)
    return data


def _balances(db: Session, user_id: int) -> dict:
    key = f"balances:{user_id}"
    cached = inv_cache.get(key, _BALANCES_TTL)
    if cached is not None:
        return cached
    data = client.get_balances(str(user_id)) or {"crypto": [], "brokers": []}
    data = apply_manual_cost_basis(db, user_id, data)
    inv_cache.put(key, data)
    return data


def _dividends(user_id: int, lookahead_days: int = 365) -> list[dict]:
    key = f"dividends:{user_id}"
    cached = inv_cache.get(key, _DIVIDENDS_TTL)
    if cached is not None:
        return cached
    data = client.get_dividends(str(user_id), lookahead_days)
    inv_cache.put(key, data)
    return data


router = APIRouter(prefix="/api/investments", tags=["investments"])


def _invalidate_user_cache(user_id: int) -> None:
    inv_cache.invalidate(f"balances:{user_id}")
    inv_cache.invalidate(f"dividends:{user_id}")


def _try_save_snapshot(db: Session, user_id: int, rates: dict) -> None:
    """Upsert today's snapshot. Accepts already-fetched rates to avoid a second CBR call."""
    try:
        balances = _balances(db, user_id)
        save_snapshot(db, user_id, balances, rates.get("usd_rub", 0.0), date.today())
    except Exception:
        pass


@router.post("/exchanges", status_code=201)
def connect_exchange(
    payload: ConnectExchangeRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    result = client.connect_exchange(
        str(user.id), payload.exchange, payload.api_key, payload.secret_key,
        payload.passphrase, portfolio_name=payload.portfolio_name,
    )
    _invalidate_user_cache(user.id)
    _snapshot_saved_today.pop(user.id, None)
    _try_save_snapshot(db, user.id, _rates())
    _snapshot_saved_today[user.id] = date.today().isoformat()
    background_tasks.add_task(client.sync_trades, str(user.id))
    return result


@router.put("/exchanges")
def update_exchange(payload: ConnectExchangeRequest, user: User = Depends(get_current_user)) -> dict:
    result = client.update_exchange(
        str(user.id), payload.exchange, payload.api_key, payload.secret_key,
        payload.passphrase, portfolio_name=payload.portfolio_name,
    )
    _invalidate_user_cache(user.id)
    return result


@router.delete("/exchanges/{portfolio_name}", status_code=204)
def delete_exchange(portfolio_name: str, user: User = Depends(get_current_user)) -> None:
    client.delete_exchange(str(user.id), portfolio_name)
    _invalidate_user_cache(user.id)


@router.post("/brokers", status_code=201)
def connect_broker(payload: ConnectBrokerRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    result = client.connect_broker(
        str(user.id), payload.broker, payload.token,
        payload.account_id, portfolio_name=payload.portfolio_name,
    )
    _invalidate_user_cache(user.id)
    _snapshot_saved_today.pop(user.id, None)
    _try_save_snapshot(db, user.id, _rates())
    _snapshot_saved_today[user.id] = date.today().isoformat()
    return result


@router.put("/brokers")
def update_broker(payload: ConnectBrokerRequest, user: User = Depends(get_current_user)) -> dict:
    result = client.update_broker(
        str(user.id), payload.broker, payload.token,
        payload.account_id, portfolio_name=payload.portfolio_name,
    )
    _invalidate_user_cache(user.id)
    return result


@router.delete("/brokers/{portfolio_name}", status_code=204)
def delete_broker(portfolio_name: str, user: User = Depends(get_current_user)) -> None:
    client.delete_broker(str(user.id), portfolio_name)
    _invalidate_user_cache(user.id)


@router.get("/summary", response_model=InvestmentsSummary)
def get_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    balances = _balances(db, user.id)
    rates = _rates()
    today_str = date.today().isoformat()
    if _snapshot_saved_today.get(user.id) != today_str:
        _try_save_snapshot(db, user.id, rates)
        _snapshot_saved_today[user.id] = today_str
    return {"crypto": balances["crypto"], "brokers": balances["brokers"], "usd_rub": rates.get("usd_rub", 0.0)}


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
def get_diversification(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> DiversificationBreakdown:
    balances = _balances(db, user.id)
    rates = _rates()
    return compute_diversification(balances, rates["usd_rub"])


@router.get("/diversification/sector/{sector}", response_model=SectorDetail)
def get_sector(
    sector: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> SectorDetail:
    balances = _balances(db, user.id)
    rates = _rates()
    return get_sector_detail(balances, rates["usd_rub"], sector)


@router.get("/dividends", response_model=list[DividendEvent])
def get_dividends(lookahead_days: int = 365, user: User = Depends(get_current_user)) -> list[dict]:
    return _dividends(user.id, lookahead_days)


@router.get("/dividends/monthly", response_model=list[MonthlyIncome])
def get_dividends_monthly(user: User = Depends(get_current_user)) -> list[MonthlyIncome]:
    return aggregate_monthly_income(_dividends(user.id))


@router.get("/assets/{ticker}", response_model=AssetDetail)
def get_asset(
    ticker: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AssetDetail:
    balances = _balances(db, user.id)
    dividends = _dividends(user.id)
    rates = _rates()
    detail = compute_asset_detail(ticker, balances, dividends, rates["usd_rub"])
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Актив не найден в портфеле")
    return detail


# ── Ручная себестоимость крипты ─────────────────────────────

@router.get("/crypto-trades", response_model=list[UnifiedCryptoTrade])
def get_crypto_trade_history(
    portfolio_name: str,
    currency: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list:
    """Единая, отсортированная по дате лента: реальные сделки с биржи
    (trading-keys-api) + ручные записи пользователя — для карточки токена."""
    return get_unified_trade_history(db, user.id, portfolio_name, currency)


@router.get("/manual-trades", response_model=list[ManualCryptoTradeOut])
def get_manual_trades(
    portfolio_name: str,
    currency: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ManualCryptoTrade]:
    return list_manual_trades(db, user.id, portfolio_name, currency)


def _resave_today_snapshot(db: Session, user_id: int) -> None:
    """save_snapshot upserts by date, so re-running it after a manual-trade
    edit overwrites today's row with the corrected invested_amount_rub —
    otherwise a bad cost basis entered and later fixed the same day stays
    frozen in investment_snapshots until the next day's snapshot job runs,
    since _try_save_snapshot only saves once per day per _snapshot_saved_today."""
    _snapshot_saved_today.pop(user_id, None)
    _try_save_snapshot(db, user_id, _rates())
    _snapshot_saved_today[user_id] = date.today().isoformat()


@router.post("/manual-trades", response_model=ManualCryptoTradeOut, status_code=status.HTTP_201_CREATED)
def create_manual_trade(
    payload: ManualCryptoTradeCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ManualCryptoTrade:
    trade = ManualCryptoTrade(user_id=user.id, **payload.model_dump())
    db.add(trade)
    db.commit()
    db.refresh(trade)
    _invalidate_user_cache(user.id)
    _resave_today_snapshot(db, user.id)
    return trade


@router.delete("/manual-trades/{trade_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_manual_trade(
    trade_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    if not delete_manual_trade(db, user.id, trade_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Запись не найдена")
    _invalidate_user_cache(user.id)
    _resave_today_snapshot(db, user.id)
