from collections import defaultdict
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.modules.investments.models import InvestmentSnapshot
from app.modules.investments.schemas import (
    AssetDetail,
    DiversificationBreakdown,
    DiversificationSlice,
    DividendEvent,
    MonthlyIncome,
    SectorDetail,
)

# Человекочитаемые классы активов по значению instrument_type из T-Bank
_ASSET_CLASS_MAP = {
    "share": "Акции",
    "bond": "Облигации",
    "etf": "ETF",
    "futures": "Фьючерсы",
    "currency": "Валюта",
}


def compute_value_totals(balances: dict, usd_rub: float) -> tuple[float, float, float]:
    """Возвращает (total_value_rub, crypto_value_rub, broker_value_rub)."""
    crypto_usdt = sum(
        wallet.get("value_usdt") or 0
        for exchange in balances.get("crypto", [])
        if exchange.get("status") == "ok"
        for wallet in exchange.get("balances", [])
    )
    crypto_rub = round(crypto_usdt * usd_rub, 2)
    broker_rub = round(
        sum(
            broker.get("total_value") or 0
            for broker in balances.get("brokers", [])
            if broker.get("status") == "ok"
        ),
        2,
    )
    return round(crypto_rub + broker_rub, 2), crypto_rub, broker_rub


def compute_invested_amount(balances: dict, usd_rub: float) -> float:
    """Приближение вложений: average_price * quantity по всем позициям брокера + крипто."""
    total = 0.0
    for exchange in balances.get("crypto", []):
        if exchange.get("status") != "ok":
            continue
        for wallet in exchange.get("balances", []):
            invested_usdt = (wallet.get("average_price") or 0) * (wallet.get("total") or 0)
            total += invested_usdt * usd_rub

    for broker in balances.get("brokers", []):
        if broker.get("status") != "ok":
            continue
        for pos in broker.get("positions", []):
            total += (pos.get("average_price") or 0) * (pos.get("quantity") or 0)

    return round(total, 2)


def compute_dividends_received(dividends: list[dict]) -> float:
    """Сумма прошедших выплат (payment_date < сегодня) в рублях."""
    today = date.today().isoformat()
    return round(
        sum(
            ev.get("total_amount") or 0
            for ev in dividends
            if (ev.get("payment_date") or "") < today
        ),
        2,
    )


def _to_slices(bucket: dict[str, float], total: float) -> list[DiversificationSlice]:
    return [
        DiversificationSlice(
            label=label,
            value_rub=round(value, 2),
            pct=round(value / total * 100, 1) if total else 0.0,
        )
        for label, value in sorted(bucket.items(), key=lambda kv: -kv[1])
    ]


def compute_diversification(balances: dict, usd_rub: float) -> DiversificationBreakdown:
    by_currency: dict[str, float] = {}
    by_source: dict[str, float] = {}
    by_sector: dict[str, float] = {}
    by_asset_class: dict[str, float] = {}

    for exchange in balances.get("crypto", []):
        if exchange.get("status") != "ok":
            continue
        exchange_name = exchange["exchange"]
        for wallet in exchange.get("balances", []):
            value_rub = (wallet.get("value_usdt") or 0) * usd_rub
            if value_rub <= 0:
                continue
            by_currency[wallet["currency"]] = by_currency.get(wallet["currency"], 0) + value_rub
            by_source[exchange_name] = by_source.get(exchange_name, 0) + value_rub
            by_sector["Криптовалюта"] = by_sector.get("Криптовалюта", 0) + value_rub
            by_asset_class["Криптовалюта"] = by_asset_class.get("Криптовалюта", 0) + value_rub

    for broker in balances.get("brokers", []):
        if broker.get("status") != "ok":
            continue
        broker_name = broker["broker"]
        for pos in broker.get("positions", []):
            value_rub = pos.get("current_value") or 0
            if value_rub <= 0:
                continue
            currency = pos.get("currency") or "rub"
            by_currency[currency] = by_currency.get(currency, 0) + value_rub
            by_source[broker_name] = by_source.get(broker_name, 0) + value_rub
            sector = pos.get("sector") or "Без сектора"
            by_sector[sector] = by_sector.get(sector, 0) + value_rub
            asset_class = _ASSET_CLASS_MAP.get(pos.get("instrument_type", ""), "Прочее")
            by_asset_class[asset_class] = by_asset_class.get(asset_class, 0) + value_rub

    grand_total = sum(by_currency.values())

    return DiversificationBreakdown(
        by_currency=_to_slices(by_currency, grand_total),
        by_source=_to_slices(by_source, grand_total),
        by_sector=_to_slices(by_sector, grand_total),
        by_asset_class=_to_slices(by_asset_class, grand_total),
    )


def get_sector_detail(balances: dict, usd_rub: float, sector: str) -> SectorDetail:
    """Все позиции, относящиеся к заданному сектору, с их долей в портфеле."""
    from app.modules.investments.schemas import BrokerPosition

    total_portfolio = compute_value_totals(balances, usd_rub)[0]
    positions: list[BrokerPosition] = []
    sector_value = 0.0

    target = sector.lower()

    for broker in balances.get("brokers", []):
        if broker.get("status") != "ok":
            continue
        for pos in broker.get("positions", []):
            pos_sector = (pos.get("sector") or "Без сектора").lower()
            if pos_sector != target:
                continue
            value_rub = pos.get("current_value") or 0
            sector_value += value_rub
            positions.append(BrokerPosition(**{k: pos[k] for k in BrokerPosition.model_fields if k in pos}))

    # Крипто в виртуальном секторе "Криптовалюта"
    if target == "криптовалюта":
        for exchange in balances.get("crypto", []):
            if exchange.get("status") != "ok":
                continue
            for wallet in exchange.get("balances", []):
                value_rub = (wallet.get("value_usdt") or 0) * usd_rub
                if value_rub <= 0:
                    continue
                sector_value += value_rub
                positions.append(BrokerPosition(
                    ticker=wallet["currency"],
                    name=wallet["currency"],
                    instrument_type="crypto",
                    quantity=wallet.get("total") or 0,
                    average_price=wallet.get("average_price") or 0,
                    current_price=(wallet.get("value_usdt") or 0) / (wallet.get("total") or 1) * usd_rub,
                    current_value=value_rub,
                    currency="usdt",
                    pnl_rub=(wallet.get("pnl_usdt") or 0) * usd_rub if wallet.get("pnl_usdt") is not None else None,
                    pnl_percent=wallet.get("pnl_percent"),
                    sector="Криптовалюта",
                ))

    return SectorDetail(
        sector=sector,
        value_rub=round(sector_value, 2),
        pct=round(sector_value / total_portfolio * 100, 1) if total_portfolio else 0.0,
        positions=sorted(positions, key=lambda p: -(p.current_value)),
    )


def compute_asset_detail(ticker: str, balances: dict, dividends: list[dict], usd_rub: float) -> AssetDetail | None:
    """Собирает полный профиль актива из уже полученных balances и dividends."""
    from app.modules.investments.schemas import BrokerPosition

    # Ищем позицию в брокерских портфелях
    pos_data: dict | None = None
    for broker in balances.get("brokers", []):
        if broker.get("status") != "ok":
            continue
        for pos in broker.get("positions", []):
            if pos.get("ticker", "").upper() == ticker.upper():
                pos_data = pos
                break
        if pos_data:
            break

    if pos_data is None:
        return None

    total_portfolio = compute_value_totals(balances, usd_rub)[0]

    qty = pos_data.get("quantity") or 0
    avg_price = pos_data.get("average_price") or 0
    cur_price = pos_data.get("current_price") or 0
    cur_value = pos_data.get("current_value") or 0
    cost_basis = round(avg_price * qty, 2)
    unrealized_pnl_rub = round(cur_value - cost_basis, 2)
    unrealized_pnl_pct = round(unrealized_pnl_rub / cost_basis * 100, 2) if cost_basis else 0.0
    weight_pct = round(cur_value / total_portfolio * 100, 2) if total_portfolio else 0.0

    # Предстоящие выплаты по этому тикеру
    today = date.today().isoformat()
    upcoming = [
        DividendEvent(**ev)
        for ev in dividends
        if ev.get("ticker", "").upper() == ticker.upper() and (ev.get("payment_date") or "") >= today
    ]

    # Годовой прогнозный доход
    one_year_out = date.today().replace(year=date.today().year + 1).isoformat()
    annual_events = [ev for ev in upcoming if (ev.payment_date or "") <= one_year_out]
    annual_income_rub = round(sum(ev.total_amount for ev in annual_events), 2)
    yoc_pct = round(annual_income_rub / cost_basis * 100, 2) if cost_basis else 0.0

    return AssetDetail(
        ticker=pos_data.get("ticker", ticker),
        name=pos_data.get("name", ticker),
        instrument_type=pos_data.get("instrument_type", ""),
        sector=pos_data.get("sector"),
        currency=pos_data.get("currency", "rub"),
        quantity=qty,
        average_price=avg_price,
        current_price=cur_price,
        position_value_rub=round(cur_value, 2),
        cost_basis_rub=cost_basis,
        unrealized_pnl_rub=unrealized_pnl_rub,
        unrealized_pnl_pct=unrealized_pnl_pct,
        portfolio_weight_pct=weight_pct,
        upcoming_dividends=upcoming,
        annual_income_rub=annual_income_rub,
        yield_on_cost_pct=yoc_pct,
    )


def aggregate_monthly_income(dividends: list[dict]) -> list[MonthlyIncome]:
    """Агрегирует предстоящие выплаты по месяцам (payment_date >= сегодня, на год вперёд)."""
    today = date.today().isoformat()
    one_year_out = date.today().replace(year=date.today().year + 1).isoformat()

    bucket: dict[str, float] = defaultdict(float)
    for ev in dividends:
        pdate = ev.get("payment_date") or ""
        if pdate < today or pdate > one_year_out:
            continue
        month = pdate[:7]  # "2025-08"
        bucket[month] += ev.get("total_amount") or 0

    return [
        MonthlyIncome(month=month, total_rub=round(total, 2))
        for month, total in sorted(bucket.items())
    ]


def save_snapshot(
    db: Session,
    user_id: int,
    balances: dict,
    usd_rub: float,
    snapshot_date: date,
    dividends: list[dict] | None = None,
) -> InvestmentSnapshot:
    total, crypto_rub, broker_rub = compute_value_totals(balances, usd_rub)
    invested = compute_invested_amount(balances, usd_rub)
    divs_received = compute_dividends_received(dividends or [])

    snapshot = (
        db.query(InvestmentSnapshot)
        .filter(InvestmentSnapshot.user_id == user_id, InvestmentSnapshot.snapshot_date == snapshot_date)
        .first()
    )
    if snapshot is None:
        snapshot = InvestmentSnapshot(user_id=user_id, snapshot_date=snapshot_date)
        db.add(snapshot)

    snapshot.total_value_rub = total
    snapshot.crypto_value_rub = crypto_rub
    snapshot.broker_value_rub = broker_rub
    snapshot.invested_amount_rub = invested
    snapshot.dividends_received_rub = divs_received
    db.commit()
    db.refresh(snapshot)
    return snapshot


def get_net_worth_history(
    db: Session, user_id: int, date_from: date | None, date_to: date | None
) -> list[InvestmentSnapshot]:
    query = db.query(InvestmentSnapshot).filter(InvestmentSnapshot.user_id == user_id)
    if date_from:
        query = query.filter(InvestmentSnapshot.snapshot_date >= date_from)
    if date_to:
        query = query.filter(InvestmentSnapshot.snapshot_date <= date_to)
    return query.order_by(InvestmentSnapshot.snapshot_date).all()
