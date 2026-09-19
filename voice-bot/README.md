# voice-bot — голосовые отчёты о дне в дневник Life Pilot

Наговариваешь боту в Telegram отчёт о дне → он расшифровывает речь, вытаскивает
структуру, пишет запись в дневник Life Pilot и отдельно считает слова-паразиты.

```
Telegram ──voice/text──► voice-bot ──► Whisper (хост, GPU)   речь → текст
                             │
                             ├──────► Qwen2.5 (хост, GPU)    текст → JSON
                             │
                             ├──────► Life Pilot API         запись дня
                             └──────► /data/fillers.jsonl    паразиты
```

Границы ответственности: Whisper знает только про звук, Qwen — только про текст,
Life Pilot — только про дневник. Вся склейка живёт здесь.

## Устройство

| Файл | За что отвечает |
|---|---|
| `app/main.py` | Telegram-хендлеры, единственный getUpdates-поллер токена |
| `app/pipeline.py` | Порядок шагов и текст подтверждения |
| `app/whisper.py` | Речь → текст, с фолбэком на перекодирование в WAV |
| `app/llm.py` | Промпт для Qwen, извлечение и валидация JSON |
| `app/fillers.py` | Подсчёт паразитов и запись в JSONL |
| `app/lifepilot.py` | Клиент `/api/integrations/*` |
| `app/hostgw.py` | Поиск адреса Windows-хоста (он меняется после ребута) |
| `app/telegram_net.py` | Обход фильтрации api.telegram.org на этой сети |

## Три неочевидных решения

**Один токен, один поллер.** Backend Life Pilot использует тот же
`TELEGRAM_BOT_TOKEN` для напоминаний о привычках. Telegram отдаёт каждый апдейт
ровно одному вызову `getUpdates`, поэтому поллер из backend удалён, и этот
контейнер — единственный читатель. Отправка (`sendMessage`) не эксклюзивна, так
что напоминания продолжают уходить из backend как раньше. Привязку `/start <code>`
бот пересылает в backend через `POST /api/integrations/telegram/link`.

**Адрес хоста задаётся через `HOST_GW`, и это вынужденно.** Whisper и Ollama
крутятся на Hyper-V хосте, чей адрес меняется при каждой перезагрузке ПК, так
что хардкодить его нельзя. Но и определить изнутри контейнера не выйдет:
`ip route` там покажет docker-мост, то есть саму VM. Монтирование `/proc/net/route`
с VM тоже не помогает — `/proc/net` это симлинк на `/proc/self/net`, и внутри
контейнера он переразрешается в его собственный сетевой неймспейс, выдавая
снова адрес моста. Проверено на живой VM: получали `172.18.0.1` вместо
`172.24.160.1`.

Поэтому адрес вычисляется там, где ответ правильный — на самой VM — и кладётся
в `infra/.env`. Скрипт `refresh-host-gw.sh` делает это по cron и пересоздаёт
контейнер, только если адрес изменился:

```
*/5 * * * * /opt/life-pilot/voice-bot/refresh-host-gw.sh >> /var/log/host-gw.log 2>&1
```

Если `HOST_GW` не задан, бот попробует прочитать смонтированный route-файл и,
обнаружив там собственный шлюз, скажет об этом прямо вместо того, чтобы молча
стучаться не на ту машину.

**Отчёт дописывается, а не затирает.** Запись дневника одна на дату, поэтому
второй отчёт за день добавляется в конец с отметкой времени. Числовые оценки
перезаписываются последним значением, а поля, про которые в речи не сказано
ни слова, не трогаются вообще. Отчёт, наговорённый до 04:00, относится к
предыдущему дню (`DAY_ROLLOVER_HOUR`).

## Настройка

Переменные живут в общем `infra/.env` (шаблон — `infra/.env.example`).
Обязательны три:

| Переменная | Что это |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Тот же токен, что у backend |
| `ALLOWED_TELEGRAM_ID` | Твой Telegram user id — отчёты принимаются только от него |
| `INTEGRATION_API_KEY` | Общий секрет для `/api/integrations/*`; должен совпадать с backend |

Свой id подскажет [@userinfobot](https://t.me/userinfobot). Ключ:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Остальное — необязательные переопределения, они перечислены в `.env.example`.

## Первый запуск

1. Заполнить `INTEGRATION_API_KEY` и `ALLOWED_TELEGRAM_ID` в `infra/.env`.
2. Поднять стек: `docker compose up -d --build` из `infra/`.
3. В Life Pilot → Настройки нажать привязку Telegram, отправить боту
   `/start <код>`. Без этого шага backend не знает, чей это чат, и вернёт 404.
4. Наговорить боту отчёт.

## Деплой на VM (без Docker Hub)

На VM нет доступа к Docker Hub, поэтому образ собирается на ПК и переносится:

```bash
# на dev-ПК
docker build -t life-pilot-voice-bot:latest ./voice-bot
docker save life-pilot-voice-bot:latest -o containers/voice-bot.tar
scp containers/voice-bot.tar user@vm:/tmp/

# на VM
docker load -i /tmp/voice-bot.tar
cd /opt/life-pilot/infra && docker compose up -d
```

Чтобы compose взял готовый образ вместо пересборки, замените в
`infra/docker-compose.yml` у сервиса `voice-bot` блок `build:` на
`image: life-pilot-voice-bot:latest`.

Альтернатива: собрать прямо на VM (`docker compose up -d --build voice-bot`) —
сработает, только если базовый `python:3.12-slim` уже в локальном кэше, потому
что `apt-get install ffmpeg` на шаге сборки требует сети.

## Диагностика

```bash
docker compose logs -f voice-bot
```

| Симптом | Причина |
|---|---|
| `Route lookup returned ... this container's own gateway` | Не задан `HOST_GW`; см. раздел про адрес хоста |
| `Whisper недоступен` | Сервис на хосте не поднят, или файрвол Windows закрыл порт 8100 |
| `No Life Pilot account is linked to this Telegram chat` | Не пройдена привязка `/start <код>` |
| `Integration API is not configured` | Пустой `INTEGRATION_API_KEY` на стороне backend |
| Бот молчит | Проверьте, что backend больше не поллит: он не должен вызывать `getUpdates` |

Статистика паразитов копится в томе `voice_bot_data`, по строке на отчёт:

```bash
docker compose exec voice-bot tail -n 5 /data/fillers.jsonl
```

Аналитика по этому файлу — отдельная задача, здесь только накопление.
