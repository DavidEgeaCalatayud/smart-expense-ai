FROM python:3.12.14-alpine3.24 AS builder

ENV PIP_NO_CACHE_DIR=1

WORKDIR /build

COPY requirements.txt ./requirements.txt
RUN apk add --no-cache build-base \
    && python -m venv /venv \
    && /venv/bin/pip install --no-cache-dir -r requirements.txt

FROM python:3.12.14-alpine3.24

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PATH="/venv/bin:${PATH}"

WORKDIR /app

RUN apk upgrade --no-cache \
    && apk add --no-cache libstdc++ libgomp \
    && addgroup -S app \
    && adduser -S -G app -h /app app

COPY --from=builder /venv /venv
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY app ./app
COPY ml ./ml

RUN chown -R app:app /app /venv
USER app

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log"]
