import logging
from datetime import date

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.db import SessionLocal
from app.models.user import User
from app.modules.investments import client
from app.modules.investments.service import save_snapshot

logger = logging.getLogger(__name__)

_scheduler = BackgroundScheduler()


def run_daily_snapshot_job() -> None:
    db = SessionLocal()
    try:
        rates = client.get_rates()
        today = date.today()
        for user in db.query(User).all():
            try:
                balances = client.get_balances(str(user.id))
                if balances is None:
                    continue  # no exchanges/brokers connected yet
                save_snapshot(db, user.id, balances, rates["usd_rub"], today)
            except Exception:
                logger.exception("Failed to save investment snapshot for user_id=%s", user.id)
    except Exception:
        logger.exception("Daily investment snapshot job failed to fetch rates")
    finally:
        db.close()


def start_scheduler() -> None:
    _scheduler.add_job(
        run_daily_snapshot_job,
        trigger="cron",
        hour=23,
        minute=50,
        id="investments_daily_snapshot",
        replace_existing=True,
    )
    _scheduler.start()


def stop_scheduler() -> None:
    _scheduler.shutdown(wait=False)
