FROM python:3.12.14-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN set -eux; \
    apt-get update; \
    apt-get upgrade -y --no-install-recommends; \
    pip install --no-cache-dir -r requirements.txt; \
    addgroup --system app; \
    adduser --system --ingroup app --home /app app; \
    rm -rf /var/lib/apt/lists/*

COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY app ./app
COPY ml ./ml

RUN chown -R app:app /app
USER app

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log"]
