# Life Pilot — руководство по коду

Как всё устроено и как это менять. Дополняет `ARCHITECTURE.md` (там — почему
выбран такой стек и что в каком модуле по смыслу) практикой: где что лежит, как
добавить своё, как выкатить и во что вы упрётесь.

---

## 1. Архитектура

```
                    ┌─────────────── Windows-хост (GPU) ───────────────┐
                    │                                                  │
                    │   Whisper  :8100        Ollama :11434            │
                    │   речь → текст          qwen2.5:7b, текст → JSON │
                    └──────────────────▲───────────────────────────────┘
                                       │ HOST_GW (динамический)
┌──────────────────── Hyper-V VM (Ubuntu, Docker) ─────────┼───────────┐
│                                                          │           │
│   caddy :80/:443 ──┬──► frontend :3000  (Next.js)        │           │
│                    └──► backend  :8000  (FastAPI) ───────┘           │
│                              │                                       │
│                              ├──► postgres :5432                     │
│                              └──► vpn-proxy :8889 ──► Telegram API   │
└──────────────────────────────────────────────────────────────────────┘
                                       ▲
                            CloudPub → https://lifepilot.cloudpub.ru
```

**Whisper и Ollama живут на Windows-хосте, а не в VM.** Им нужна видеокарта,
которой у VM нет. Backend ходит к ним по IP хоста в сети Hyper-V.

**Этот IP динамический.** Hyper-V Default Switch меняет подсеть при каждой
перезагрузке хоста, так что адрес нельзя зашивать в код. Как он определяется —
раздел 5.

Голосовой ввод — единственное, что связывает VM с хостом. Всё остальное
(дневник, привычки, спорт, инвестиции) живёт целиком в VM.

---

## 2. Backend (FastAPI)

### Структура

```
backend/app/
├── main.py              точка входа: сборка приложения, регистрация роутеров,
│                        запуск планировщиков в lifespan
├── core/
│   ├── config.py        все настройки, pydantic-settings, читает .env
│   ├── db.py            engine, SessionLocal, Base, get_db
│   ├── deps.py          get_current_user, require_admin
│   ├── security.py      bcrypt, выпуск и разбор JWT
│   ├── hostgw.py        поиск адреса Windows-хоста
│   └── uploads.py       приём файлов в backend/uploads
├── models/user.py       User — единственная модель вне модулей
└── modules/<имя>/       по модулю на предметную область
```

Модуль — это папка с `router.py`, `schemas.py` и по надобности `models.py`,
`service.py`. Границы жёсткие: `router.py` разбирает HTTP и отдаёт ответы,
`service.py` считает, `models.py` описывает таблицы. Логику, которая нужна
двум модулям, кладут в `service.py` того, кому она принадлежит по смыслу, и
импортируют — не копируют.

### Модули и их роуты

| Модуль | Префикс | Что делает |
|---|---|---|
| `auth` | `/api/auth` | Регистрация по инвайт-коду, логин, `/me` (в т.ч. таймзона) |
| `diary` | `/api/diary` | Запись дня, теги, **голосовой ввод** |
| `habits` | `/api/habits` | Привычки, логи, каталог, напоминания |
| `sport` | `/api/exercises`, `/api/exercise-logs` | Упражнения и подходы |
| `reports` | `/api/reports` | Агрегаты: оценка дня, тренды, влияние тегов, сон |
| `investments` | `/api/investments` | Прокси к trading-keys-api + свои снапшоты |
| `telegram` | `/api/telegram` | Привязка аккаунта, напоминания |
| `admin` | `/api/admin` | Пользователи, инвайт-код, каталоги (под `require_admin`) |

Полный список всегда доступен живьём: `http://<backend>:8000/docs`.

### Авторизация

JWT в заголовке `Authorization: Bearer <token>`. Токен живёт 7 дней
(`access_token_expire_minutes`), внутри — email в `sub`.

```python
from app.core.deps import get_current_user, require_admin

@router.get("/mine")
def mine(user: User = Depends(get_current_user)): ...

@router.post("/admin-only")
def admin_only(user: User = Depends(require_admin)): ...
```

`get_current_user` резолвит email из токена в пользователя. **Всегда фильтруйте
запросы по `user.id`** — на уровне БД разделения нет, его обеспечивает код.

### Как добавить модуль

1. `backend/app/modules/<имя>/` с `__init__.py`, `router.py`, `schemas.py`.
2. В `router.py`: `router = APIRouter(prefix="/api/<имя>", tags=["<имя>"])`.
3. Модели — в `models.py`, импортировать в `app/models/__init__.py`, иначе
   Alembic их не увидит.
4. Миграция: `alembic revision --autogenerate -m "..."`, проверить руками
   сгенерированное — autogenerate врёт на enum и ARRAY.
5. Зарегистрировать роутер в `main.py`.

**Порядок роутов имеет значение.** FastAPI матчит сверху вниз, поэтому
литеральные пути объявляют раньше параметризованных. В `diary/router.py`
`/tags` и `/voice-transcribe` стоят до `/{entry_date}` — иначе FastAPI пытается
разобрать `tags` как дату и отвечает 422, не доходя до обработчика.

### Голосовой ввод

`POST /api/diary/voice-transcribe`, обычный JWT, `multipart/form-data`, поле
`file`.

```
аудио (webm/opus) ──► Whisper ──► текст ──► Qwen ──► JSON полей дневника
```

- `app/modules/diary/voice.py` — оба клиента, промпт, разбор и нормализация.
- Эндпоинт **ничего не сохраняет**: возвращает разобранные поля, пользователь
  подтверждает их в интерфейсе и сохраняет обычным `PUT /api/diary`. Неверно
  распознанная цифра не попадёт в дневник незаметно.
- **Аудио не пишется на диск** — читается в память, уходит в Whisper и
  забывается. Дневник это самые приватные данные приложения, голос вдобавок
  биометрия; транскрипт — единственное, что стоит хранить.
- Поля, которых не было в речи, приходят `null`, и фронт их не трогает.
- Теги фильтруются по словарю пользователя на сервере: придуманный моделью тег
  иначе навсегда засорит выбор.
- Если модель вернула `text: null` (qwen2.5:7b это делает), сохраняется сырая
  расшифровка с пометкой `used_raw_transcript` — пустая запись хуже корявой.

Таймауты: Whisper 60 с, Ollama 30 с, при превышении — 504.

---

## 3. Frontend (Next.js 16, App Router)

### Структура

```
frontend/src/
├── app/                  страницы, роутинг по папкам
│   ├── layout.tsx        общий каркас
│   ├── globals.css       Tailwind + CSS-переменные темы
│   ├── diary/            запись, состояние, привычки, теги, календарь, отчёты
│   ├── sport/            упражнения, прогресс, каталог, календарь
│   ├── investments/      портфель, диверсификация, дивиденды, активы
│   ├── admin/            пользователи и каталоги
│   └── login, register, settings
├── components/           переиспользуемое между страницами
└── lib/
    ├── api.ts            HTTP-клиент, токен, ApiError
    ├── types.ts          типы ответов backend
    └── session-cache.ts  кэш на время загрузки страницы
```

Все страницы — клиентские (`"use client"`). Server actions и RSC намеренно не
используются: код проще и предсказуемее.

### API-клиент

```ts
import { api, ApiError } from "@/lib/api";

const entry = await api.get<DiaryEntry>(`/api/diary/${date}`);
await api.put<DiaryEntry>("/api/diary", { entry_date: date, content });
await api.upload<VoiceTranscription>("/api/diary/voice-transcribe", formData);
```

Токен подставляется сам из `localStorage`. Ошибки прилетают как `ApiError` с
полем `status` — по нему и различают случаи:

```ts
catch (err) {
  if (err instanceof ApiError && err.status === 404) { /* записи нет — это норма */ }
}
```

`API_URL` берётся из `NEXT_PUBLIC_API_URL` и **на проде пустой**: запросы идут
на тот же origin, а `/api/*` разруливает Caddy. Пустая строка — осмысленное
значение, поэтому в коде `??`, а не `||`.

### Как добавить страницу

1. `src/app/<путь>/page.tsx`, дефолтный экспорт компонента.
2. `"use client"` первой строкой.
3. Если страница читает `useSearchParams` — обернуть в `<Suspense>`, иначе
   сборка падает на пререндере (см. любую страницу дневника).
4. Типы ответов — в `lib/types.ts`, рядом с остальными.
5. Ссылку добавить в `components/nav-bar.tsx`.

Компоненты кладут в `src/components/`, если их используют две страницы и
больше. Одноразовые оставляют рядом со страницей.

### Голосовой ввод на фронте

`components/voice-capture.tsx` — запись через `MediaRecorder`, отправка,
панель подтверждения. Родительская страница получает только то, что
пользователь отметил галочками.

Панель по умолчанию отмечает лишь непустые поля, которые ничего не затирают:
уже заполненное требует осознанного второго клика, а для текста предлагается
«дописать» либо «заменить».

**`getUserMedia` работает только в защищённом контексте** — `https://` или
`localhost`. По `http://<ip>:3000` микрофон не откроется, и компонент об этом
прямо говорит. Через CloudPub всё в порядке.

---

## 4. Инфраструктура

### Что в `infra/`

| Файл | Назначение |
|---|---|
| `docker-compose.yml` | Все сервисы |
| `Caddyfile` | `/api/*` и `/uploads/*` → backend, остальное → frontend |
| `.env` | Реальные значения (в `.gitignore`) |
| `.env.example` | Шаблон с пояснениями |
| `xray-config.json` | Конфиг VPN, содержит ключи подписки (в `.gitignore`) |

### Переменные окружения

| Переменная | Назначение |
|---|---|
| `POSTGRES_USER/PASSWORD/DB` | Учётные данные БД |
| `DATABASE_URL` | Строка подключения backend (хост — `postgres`, не localhost) |
| `SECRET_KEY` | Подпись JWT. Смена разлогинивает всех |
| `REGISTRATION_CODE` | Инвайт-код. Переопределяется из админки через `app_settings` |
| `CORS_ORIGINS` | JSON-массив разрешённых origin |
| `INVESTMENTS_API_URL/KEY` | Доступ к trading-keys-api по внутренней docker-сети |
| `TELEGRAM_BOT_TOKEN` | Напоминания и привязка аккаунтов |
| `TELEGRAM_BOT_USERNAME` | Для ссылки `t.me/<username>?start=<код>` |
| `TELEGRAM_PROXY` | Прокси к Telegram API. Пусто — идём напрямую |
| `INTEGRATION_API_KEY` | Зарезервировано, сейчас не читается никем |
| `HOST_GW` | Адрес Windows-хоста. **Главный механизм**, см. раздел 5 |
| `HOST_ROUTE_FILE` | Где искать route-таблицу, если `HOST_GW` пуст. По умолчанию `/host/net/route` |
| `WHISPER_URL`, `OLLAMA_URL` | Полные адреса в обход `HOST_GW` |
| `WHISPER_PORT`, `OLLAMA_PORT`, `OLLAMA_MODEL` | Значения по умолчанию 8100 / 11434 / `qwen2.5:7b` |
| `WHISPER_TIMEOUT`, `OLLAMA_TIMEOUT` | 60 и 30 секунд; при превышении эндпоинт отдаёт 504 |
| `NEXT_PUBLIC_API_URL` | На проде пусто |
| `DOMAIN` | Домен для Caddy |

### Деплой

Из VM не виден ни Docker Hub, ни GitHub (раздел 6), поэтому **образы собираются
на ПК и переносятся файлом**.

```powershell
# 1. На ПК: собрать
$SHA = git rev-parse --short HEAD
$env:BUILD_REF = $SHA
docker compose -f infra/docker-compose.yml build backend frontend

# 2. Сохранить в один файл
docker save life-pilot-backend life-pilot-frontend -o containers/images-$SHA.tar

# 3. Код — только изменившиеся файлы, с LF (иначе Windows подсунет CRLF)
git -c core.autocrlf=false -c core.eol=lf archive --format=tar.gz `
    -o containers/code-$SHA.tar.gz HEAD $(git diff --name-only <база>..HEAD)

# 4. Перенести
scp containers/images-$SHA.tar containers/code-$SHA.tar.gz user@<ip-vm>:/tmp/
```

```bash
# 5. На VM
docker load -i /tmp/images-<sha>.tar
docker run --rm --entrypoint cat life-pilot-backend:latest /app/BUILD_REF   # должен совпасть
tar -xzf /tmp/code-<sha>.tar.gz -C ~/lifepilot
docker compose up -d --force-recreate backend frontend
```

**Проверяйте `BUILD_REF` до запуска.** В каждый образ на сборке вшивается
git-ref, backend отдаёт его в `GET /api/health`. Без этой проверки легко
полдня отлаживать контейнер, поднятый на старом образе — так и было.

`--force-recreate` не перестраховка: `env_file` читается при создании
контейнера, и обычный restart подхватит старые переменные.

**Не перезаписывайте `infra/docker-compose.yml` на VM вслепую** — там локальные
правки (`image:` вместо `build:`, внешняя сеть `homelab_web`). Исключайте его
из архива кода.

---

## 5. GPU-сервисы на хосте

### Whisper — порт 8100

Служба Windows под NSSM. `POST /transcribe`, `multipart/form-data`, поле
`file`, отдаёт `{"text": "...", "language": "ru"}`.

### Ollama — порт 11434

Автозапуск, модель `qwen2.5:7b`. Backend зовёт `POST /api/chat` с
`format: "json"` и `temperature: 0` — это извлечение фактов, а не сочинение,
и любая «креативность» здесь превращается в выдуманные числа.

Оба слушают `0.0.0.0` и открыты в брандмауэре Windows («Whisper for VM»,
«Ollama for VM»). Без этих правил VM до них не достучится.

### Как определяется HOST_GW

Адрес хоста в сети Hyper-V меняется при каждой его перезагрузке, поэтому
определяется, а не зашивается. Порядок в `app/core/hostgw.py`:

1. **`HOST_GW` из `.env`** — основной механизм.
2. Смонтированный route-файл (`/proc/net/route:/host/net/route:ro`) — запасной.
3. Иначе внятная ошибка с указанием, что делать.

Результат кэшируется на минуту и перечитывается при сетевой ошибке, так что
переезд хоста лечится сам, без пересоздания контейнера.

**Почему `HOST_GW`, а не автоопределение.** Изнутри контейнера адрес хоста
получить нельзя: `ip route` там показывает docker-мост, то есть саму VM.
Монтирование `/proc/net/route` тоже не работает — `/proc/net` это симлинк на
`/proc/self/net`, и внутри контейнера он переразрешается в его собственный
сетевой неймспейс. Проверено на живой VM: получали `172.18.0.1` вместо
`172.24.160.1`, причём молча и правдоподобно. Теперь такой ответ распознаётся
как ошибка. Команда из ТЗ (`ip route | awk '/default/{print $3}'`) верна —
выполнять её надо на VM, а не в контейнере.

Чтобы пережить перезагрузку хоста, обновляйте `HOST_GW` по cron:

```bash
*/5 * * * * /opt/life-pilot/scripts/refresh-host-gw.sh >> /tmp/host-gw.log 2>&1
```

Скрипт сравнивает текущий шлюз с записанным и пересоздаёт контейнер, только
если адрес изменился.

---

## 6. Известные ограничения сети VM

Это не догадки — всё измерено, и на каждом пункте было потеряно время.

| Что недоступно | Симптом | Обход |
|---|---|---|
| **Docker Hub, ghcr.io** | `EOF` при `docker pull` | Сборка на ПК → `docker save`/`load` |
| **GitHub** | `git pull` и `git clone` висят | Перенос архива через `scp` |
| **Telegram API** | TCP встаёт за 0.0 с, запрос висит до таймаута | `TELEGRAM_PROXY`, откат на прямое соединение |
| **IPv6** | `Network is unreachable` сразу | Форсировать IPv4 |

**IPv6 — главная ловушка.** Маршрут анонсирован, но пакеты не доставляются.
Любой клиент, который резолвит имя в AAAA и идёт туда, молча умирает. Python в
backend это обходит патчем `socket.getaddrinfo`; сторонним бинарникам нужен
свой способ (Xray — `sockopt.domainStrategy: ForceIPv4`). **Новый сервис
проверяйте на этом в первую очередь.**

Диагностика, отделяющая одно от другого:

```bash
docker compose exec -T <сервис> python -c "
import socket, ssl, time
for h in ['1.1.1.1','github.com','api.telegram.org']:
    t=time.monotonic()
    try:
        socket.create_connection((h,443),8).close(); print(f'TCP  OK   {h} {time.monotonic()-t:.2f}s')
    except Exception as e: print(f'TCP  FAIL {h} {type(e).__name__}')
"
```

`Network is unreachable` — это IPv6. Таймаут — фильтрация или оборванный
канал. Мгновенный отказ — нет маршрута.

Стоит знать и вот что: связь VM с интернетом наблюдалась нестабильной, вплоть
до полного отсутствия исходящего HTTPS при живом ICMP. Подозрение — на VPN-клиент
на хосте, забирающий маршрут по умолчанию (`0.0.0.0/0` через `happ-tun`), из-за
чего NAT Default Switch отправляет трафик VM в туннель, который его не
обслуживает. **Если с VM внезапно «отвалился интернет» — проверьте это раньше,
чем начнёте чинить приложение.** Радикальное решение — перевести VM с Default
Switch на External Switch: она получит обычный адрес в домашней сети, минуя
маршруты хоста, и заодно исчезнет вся возня с `HOST_GW`.

Голосового ввода всё это не касается: Whisper и Ollama живут в локальной сети,
и интернет VM им не нужен. Ради этого он и переехал в браузер из Telegram.

---

## 7. Чеклист нового сервиса

1. **Dockerfile** — база из уже закэшированных на ПК образов (`docker images`),
   реестры недоступны. Вшить `ARG BUILD_REF` и записать его в файл.
2. **compose** — сервис в `infra/docker-compose.yml`, `restart: unless-stopped`,
   секреты через `env_file`, порты наружу только если действительно нужны.
3. **IPv6** — убедиться, что клиент форсирует IPv4 (раздел 6).
4. **Сборка на ПК** — `BUILD_REF=$(git rev-parse --short HEAD) docker compose build <сервис>`.
5. **Перенос** — `docker save` → `scp` → `docker load`, проверить `BUILD_REF`
   **до** запуска.
6. **Брандмауэр** — если сервис слушает на хосте Windows, правило для подсети
   Hyper-V.
7. **Публичный доступ** — маршрут в `Caddyfile`; наружу через CloudPub. Если
   доступ не нужен, порт не публиковать: внутренней docker-сети достаточно.
8. **Документация** — строку в таблицу переменных раздела 4 и в схему
   раздела 1.
