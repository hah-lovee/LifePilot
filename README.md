# Life Pilot

Личное приложение для управления собой: дневник с оценкой дня, привычки, трекер тренировок и (в планах) интеграция с инвестициями. Закрытый сервис — регистрация только по инвайт-коду.

## Возможности

**Дневник**
- Ежедневная запись + теги дня (базовые и свои)
- Календарь с цветовой подсветкой оценки дня
- Отчётность: графики динамики, влияние тегов на оценку дня, статистика по привычкам

**Привычки**
- Оценка 0–10 за день, частота daily / weekly / monthly
- Оценка дня считается автоматически как среднее оценок привычек
- Архивация без потери истории
- Каталог привычек от администратора — пользователь сам решает, добавить ли себе

**Спорт**
- Свои упражнения с фото, группа мышц
- Журнал подходов (дата, вес, повторы, количество подходов)
- График прогресса (максимальный вес по датам) + таблица последних подходов
- Каталог упражнений от администратора (с фото) — добавляется в свой список по кнопке

**Админка** (для пользователей с флагом `is_admin`)
- Управление инвайт-кодом регистрации
- Список пользователей, назначение/снятие прав администратора
- Создание и удаление каталожных привычек и упражнений (с фото)

**Инвестиции** — в планах, интеграция существующего Python-сервиса парсинга (см. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

## Стек

| Слой | Технологии |
|---|---|
| Backend | FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL, JWT |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Recharts |
| Деплой | Docker Compose + Caddy (авто-TLS) |

## Структура

```
backend/   — FastAPI-приложение (модули: auth, habits, diary, reports, sport, admin)
frontend/  — Next.js-приложение
infra/     — docker-compose.yml + Caddyfile для продакшена
docs/      — архитектура, обоснование стека, roadmap
```

## Локальный запуск (без Docker)

Требуется PostgreSQL (можно в Docker: `docker run -d -p 5432:5432 -e POSTGRES_USER=life_pilot -e POSTGRES_PASSWORD=life_pilot -e POSTGRES_DB=life_pilot postgres:16-alpine`).

```bash
# backend
cd backend
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt   # Linux/macOS: source .venv/bin/activate && pip install -r requirements.txt
cp .env.example .env                              # заполнить DATABASE_URL, SECRET_KEY, REGISTRATION_CODE
./.venv/Scripts/python -m alembic upgrade head
./.venv/Scripts/python -m uvicorn app.main:app --reload

# frontend (в отдельном терминале)
cd frontend
npm install
npm run dev
```

Backend — http://localhost:8000 (Swagger-документация на `/docs`), frontend — http://localhost:3000.

Первый зарегистрированный пользователь автоматически становится администратором.

## Переменные окружения

**`backend/.env`** (см. `backend/.env.example`):

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | строка подключения к PostgreSQL |
| `SECRET_KEY` | секрет для подписи JWT |
| `REGISTRATION_CODE` | инвайт-код по умолчанию (можно переопределить из админки) |
| `CORS_ORIGINS` | список разрешённых origin для фронтенда |
| `UPLOAD_DIR` | каталог для загруженных фото упражнений |

**`frontend`**: `NEXT_PUBLIC_API_URL` — адрес backend (по умолчанию `http://localhost:8000` в dev, `/api` за Caddy в проде).

## Продакшен

```bash
cd infra
cp .env.example .env   # заполнить пароли, SECRET_KEY, REGISTRATION_CODE, DOMAIN
docker compose up -d --build
```

Миграции применяются автоматически при старте контейнера backend.

## Документация

Подробности об архитектурных решениях, обосновании стека и roadmap модулей — в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
