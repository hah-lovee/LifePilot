import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.db import SessionLocal
from app.models.user import User
from app.modules.habits.models import Habit, HabitLog
from app.modules.telegram import client

logger = logging.getLogger(__name__)

_scheduler = BackgroundScheduler()


def run_reminder_check_job() -> None:
    """Fires every minute; matches habits whose reminder_time equals the
    current HH:MM *in the owning user's own timezone* (the server runs in
    UTC, and reminder times are entered as the user's local wall-clock time)
    and whose reminder_weekdays includes today, also in that timezone. Skips
    habits already logged today, and users who haven't linked Telegram yet."""
    now_utc = datetime.now(timezone.utc)

    db = SessionLocal()
    try:
        users = db.query(User).filter(User.telegram_chat_id.isnot(None)).all()
        for user in users:
            try:
                local_now = now_utc.astimezone(ZoneInfo(user.timezone))
            except Exception:
                logger.warning("Invalid timezone %r for user_id=%s, skipping", user.timezone, user.id)
                continue
            current_time = local_now.strftime("%H:%M")
            weekday = local_now.weekday()  # 0=Monday..6=Sunday
            today = local_now.date()

            habits = (
                db.query(Habit)
                .filter(
                    Habit.user_id == user.id,
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
                client.send_message(
                    user.telegram_chat_id, f"⏰ Напоминание: «{habit.name}» — не забудь отметить сегодня."
                )
    except Exception:
        logger.exception("Habit reminder check failed")
    finally:
        db.close()


def start_scheduler() -> None:
    # Outbound reminders only. This process must never call getUpdates:
    # Telegram hands each update to exactly one getUpdates consumer, and that
    # consumer is the voice-bot container, which forwards "/start <code>"
    # back to us via POST /api/integrations/telegram/link. sendMessage has no
    # such exclusivity, so reminders can keep going out from here.
    _scheduler.add_job(
        run_reminder_check_job,
        trigger="cron",
        minute="*",
        second=0,
        id="telegram_habit_reminders",
        replace_existing=True,
    )
    _scheduler.start()


def stop_scheduler() -> None:
    _scheduler.shutdown(wait=False)
