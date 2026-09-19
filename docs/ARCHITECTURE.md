# Life Pilot — архитектура и roadmap

## Состав проекта

- `backend/` — FastAPI (Python), SQLAlchemy 2.0, Alembic, PostgreSQL.
- `frontend/` — Next.js 16 (App Router, TypeScript, Tailwind), все страницы — клиентские компоненты, ходят в backend по REST с JWT в `localStorage`.
- `infra/` — `docker-compose.yml`, `Caddyfile`, `.env.example` для продакшен-разворачивания на VPS.
- `docs/` — этот файл.

## Почему такой стек

- **Backend на Python/FastAPI** — по запросу: вы можете читать и менять код. FastAPI даёт автогенерацию OpenAPI-схемы (`/docs`), что упрощает синхронизацию с фронтом.
- **PostgreSQL** — поддержка enum-типов, ARRAY (используется для тегов дневника), надёжность для финансовых/исторических данных (актуально для будущего модуля инвестиций).
- **Next.js на фронте** — вы не пишете фронтенд сами, поэтому выбор оптимизирован под Claude/ассистента: TypeScript ловит ошибки на этапе сборки, страницы простые (без server actions/RSC-специфики — обычные клиентские страницы с `fetch`), что снижает риск тонких багов.
- **Closed-circle регистрация** — публичной регистрации нет: новый пользователь должен знать `REGISTRATION_CODE` (общий инвайт-код в `.env`). Подходит для "я + несколько близких" без необходимости делать админку.

## Оркестрация на VPS: Docker Compose, а не Kubernetes

Для одного VPS и небольшого числа пользователей Kubernetes — избыточная сложность (нужен минимум 1 control-plane, etcd, лишний слой сетевых абстракций). **Docker Compose v2 + Caddy** — практичный выбор:

- Caddy сам получает и продлевает TLS-сертификаты (Let's Encrypt) — не нужен отдельный certbot.
- `docker-compose.yml` уже описывает: `postgres`, `backend`, `frontend`, `caddy`.
- Если со временем понадобится больше отказоустойчивости — следующий шаг это **Docker Swarm** (тот же `docker-compose.yml` почти без изменений, `docker stack deploy`), а не Kubernetes.

### Запуск на VPS

```bash
cd infra
cp .env.example .env   # заполнить пароли, SECRET_KEY, REGISTRATION_CODE, DOMAIN
docker compose up -d --build
docker compose exec backend alembic upgrade head   # миграции применяются и автоматически при старте контейнера
```

## Модуль 1 — Дневник + Привычки (реализован)

Схема (`backend/app/modules/habits`, `backend/app/modules/diary`):

- `habits(id, user_id, name, frequency[daily|weekly|monthly], schedule_detail, is_active)`
- `habit_logs(id, habit_id, log_date, score 1-10, note)` — один лог на привычку на дату (`UniqueConstraint`).
- `diary_entries(id, user_id, entry_date, content, tags[], day_score)` — одна запись на день.

**Оценка дня** считается автоматически (`app/modules/diary/service.py::recompute_day_score`) как среднее всех `habit_logs.score` пользователя за эту дату, и пересчитывается при каждом изменении лога привычки. Дневниковый текст и теги при этом не трогаются.

**Отчётность** (`app/modules/reports`):
- `/api/reports/summary` — средняя оценка дня за 7/30 дней + по каждой привычке: средняя оценка за 30 дней и текущая серия (streak).
- `/api/reports/day-scores` — временной ряд оценки дня для графика.
- `/api/reports/habits/{id}/trend` — временной ряд оценок конкретной привычки.
- `/api/reports/tag-impact` — для каждого тега дневника сравнивает среднюю оценку дня в дни с тегом и без него. Это и есть механизм "что влияет на привычки": если тег "перелёт" даёт среднюю оценку 4.2 против 7.8 без него — видно, что перелёты сбивают привычки.

## Модуль 2 — Спорт (реализован)

Схема (`backend/app/modules/sport`):

- `exercises(id, user_id, name, description, muscle_group, photo_url, is_base)` — `user_id` нулевой для каталожных (`is_base=True`) упражнений, заведённых администратором.
- `exercise_logs(id, exercise_id, log_date, weight, reps, sets, note)` — без уникальности по дате: за один день можно записать несколько подходов.
- `POST /api/exercises/{id}/adopt` — копирует каталожное упражнение в личный список пользователя.

Прогресс считается на фронтенде из логов: максимальный вес по датам (график) + таблица последних подходов (`/sport/progress`).

## Модуль 2.1 — Админка (реализован)

`backend/app/modules/admin` (все эндпоинты под `require_admin`):

- Управление списком пользователей и флагом `is_admin` (первый зарегистрированный пользователь становится администратором автоматически).
- Мутабельный инвайт-код — хранится в таблице `app_settings` (key/value), переопределяет `REGISTRATION_CODE` из `.env` без перезапуска backend.
- Создание/удаление каталожных привычек (`habits.is_base=True`) и упражнений (`exercises.is_base=True`, с загрузкой фото через `UploadFile` → `backend/uploads`, отдаются статикой по `/uploads`).

Привычки используют тот же паттерн "каталог": `habits.user_id` нулевой и `is_base=True` для записей администратора, `POST /api/habits/{id}/adopt` копирует привычку в личный список.

## Модуль 3 — Инвестиции (план, интеграция существующего сервиса)

Существующий бэкенд парсинга инвестиций — уже Python, состоит из 3 контейнеров: Vault → Vault-init → API. Рекомендуемый путь интеграции:

1. **Не переписывать** его — поднять как дополнительные сервисы в том же `infra/docker-compose.yml` (или отдельный `docker-compose.investments.yml`, подключённый к той же docker-сети), сохранив Vault как хранилище токенов бирж/банка.
2. Life Pilot backend обращается к investments-API **по внутренней docker-сети** (например, `http://investments-api:8000`), не через публичный интернет — меньше поверхность атаки.
3. В Life Pilot добавляется тонкий модуль `app/modules/investments` с одним-двумя эндпоинтами вида `/api/investments/summary`, которые проксируют/кешируют ответ внутреннего API и отображаются на отдельной странице фронтенда — без дублирования логики парсинга.
4. Когда будет ясен контракт ответов investments-API (какие поля отдаёт), можно зафиксировать Pydantic-схемы и решить, нужно ли сохранять снэпшоты в Postgres Life Pilot для истории/графиков, или показывать live-данные.

## Безопасность (текущее состояние)

- Регистрация закрыта инвайт-кодом (`REGISTRATION_CODE`), а не публична.
- Пароли хешируются `bcrypt` напрямую (не `passlib` — у него известная несовместимость с новыми версиями `bcrypt`, вызывающая `password cannot be longer than 72 bytes` даже на коротких паролях).
- JWT токен живёт 7 дней (подходит для личного/семейного использования, не для публичного сервиса).
- CORS ограничен списком `cors_origins` в конфиге — на проде должен содержать только реальный домен.

## Локальный запуск без Docker (для разработки)

```bash
# backend
cd backend
python -m venv .venv && ./.venv/Scripts/pip install -r requirements.txt
# поднять Postgres локально или в Docker на 5432, затем:
./.venv/Scripts/python -m alembic upgrade head
./.venv/Scripts/python -m uvicorn app.main:app --reload

# frontend
cd frontend
npm install
npm run dev
```
