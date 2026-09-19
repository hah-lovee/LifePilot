FROM python:3.12-slim

WORKDIR /app

# ffmpeg is the fallback path in app/whisper.py: Telegram ships voice notes as
# OGG/Opus, and if the Whisper service refuses that container we re-encode to
# 16 kHz mono WAV and retry. Installed at build time on the dev PC — the VM has
# no Docker Hub / apt access, the image reaches it via docker save/load.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Unbuffered so `docker compose logs -f` shows the pipeline in real time.
ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "app.main"]
