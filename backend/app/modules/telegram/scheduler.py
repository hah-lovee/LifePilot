import logging
from datetime import date, datetime

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.db import SessionLocal
from app.models.user import User
from app.modules.habits.models import Habit, HabitLog
from app.modules.telegram import client
from app.modules.telegram.poller import poll_updates

logger = logging.getLogger(__name__)

_scheduler = BackgroundScheduler()


def run_reminder_check_job() -> None:
    """Fires every minute; matches habits whose reminder_time equals the
    current HH:MM and whose reminder_weekdays includes today. Skips habits
    already logged today, and users who haven't linked Telegram yet."""
    now = datetime.now()
    current_time = now.strftime("%H:%M")
    today = date.today()
    weekday = today.weekday()  # 0=Monday..6=Sunday

    db = SessionLocal()
    try:
        habits = (
            db.query(Habit)
            .filter(
                Habit.is_active.is_(True),
                Habit.reminder_enabled.is_(True),
                Habit.reminder_time == current_time,
            )
            .all()
        )
        for habit in habits:
            if weekday not in (habit.reminder_weekdays or []):
                continue
            already_logged = (
                db.query(HabitLog)
                .filter(HabitLog.habit_id == habit.id, HabitLog.log_date == today)
                .first()
            )
            if already_logged is not None:
                continue
            user = db.query(User).filter(User.id == habit.user_id).first()
            if user is None or not user.telegram_chat_id:
                continue
            client.send_message(user.telegram_chat_id, f"⏰ Напоминание: «{habit.name}» — не забудь отметить сегодня.")
    except Exception:
        logger.exception("Habit reminder check failed")
    finally:
        db.close()


def start_scheduler() -> None:
    _scheduler.add_job(
        run_reminder_check_job,
        trigger="cron",
        minute="*",
        second=0,
        id="telegram_habit_reminders",
        replace_existing=True,
    )
    _scheduler.add_job(
        poll_updates,
        trigger="interval",
        seconds=15,
        id="telegram_poll_updates",
        replace_existing=True,
    )
    _scheduler.start()


def stop_scheduler() -> None:
    _scheduler.shutdown(wait=False)
