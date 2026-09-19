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

# Stamped at build time with the git ref, so the running image can be checked
# against the source it was supposedly built from — without starting it:
#   docker run --rm --entrypoint cat life-pilot-voice-bot:latest /app/BUILD_REF
ARG BUILD_REF=unknown
RUN echo "$BUILD_REF" > /app/BUILD_REF

# Unbuffered so `docker compose logs -f` shows the pipeline in real time.
ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "app.main"]
