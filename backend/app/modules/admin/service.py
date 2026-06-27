from sqlalchemy.orm import Session

from app.modules.admin.models import AppSetting

REGISTRATION_CODE_KEY = "registration_code"


def get_setting(db: Session, key: str) -> str | None:
    setting = db.query(AppSetting).filter(AppSetting.key == key).first()
    return setting.value if setting else None


def set_setting(db: Session, key: str, value: str) -> None:
    setting = db.query(AppSetting).filter(AppSetting.key == key).first()
    if setting is None:
        db.add(AppSetting(key=key, value=value))
    else:
        setting.value = value
    db.commit()
