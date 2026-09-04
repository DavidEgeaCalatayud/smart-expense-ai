FROM python:3.12.14-alpine3.24

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN apk upgrade --no-cache \
    && apk add --no-cache libstdc++ libgomp \
    && pip install --no-cache-dir -r requirements.txt \
    && addgroup -S app \
    && adduser -S -G app -h /app app

COPY alembic.ini ./alembic.ini
COPY alembic ./alembic
COPY app ./app
COPY ml ./ml

RUN chown -R app:app /app
USER app

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log"]
