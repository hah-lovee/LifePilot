from datetime import date

from sqlalchemy.orm import Session

from app.modules.investments.models import InvestmentSnapshot
from app.modules.investments.schemas import DiversificationBreakdown, DiversificationSlice


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


def compute_diversification(balances: dict, usd_rub: float) -> DiversificationBreakdown:
    by_currency: dict[str, float] = {}
    by_source: dict[str, float] = {}
    by_sector: dict[str, float] = {}

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

    def to_slices(bucket: dict[str, float]) -> list[DiversificationSlice]:
        return [
            DiversificationSlice(label=label, value_rub=round(value, 2))
            for label, value in sorted(bucket.items(), key=lambda kv: -kv[1])
        ]

    return DiversificationBreakdown(
        by_currency=to_slices(by_currency),
        by_source=to_slices(by_source),
        by_sector=to_slices(by_sector),
    )


def save_snapshot(db: Session, user_id: int, balances: dict, usd_rub: float, snapshot_date: date) -> InvestmentSnapshot:
    total, crypto_rub, broker_rub = compute_value_totals(balances, usd_rub)

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
