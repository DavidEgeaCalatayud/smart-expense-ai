FROM node:22-alpine3.24 AS web-build
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ENV VITE_API_BASE_URL=""
RUN npm run build

FROM python:3.12.14-alpine3.24 AS python-build
WORKDIR /build
COPY backend/requirements.txt ./
RUN apk add --no-cache build-base \
    && python -m venv /venv \
    && /venv/bin/pip install --no-cache-dir -r requirements.txt

FROM python:3.12.14-alpine3.24
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/venv/bin:${PATH}" \
    PYTHONPATH=/app
WORKDIR /app
RUN apk upgrade --no-cache \
    && apk add --no-cache nginx ca-certificates libstdc++ libgomp \
    && addgroup -S app \
    && adduser -S -G app -h /app app
COPY --from=python-build /venv /venv
COPY backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY backend/app ./app
COPY backend/ml ./ml
COPY backend/deploy ./deploy
COPY frontend/nginx.conf ./nginx-source.conf
COPY --from=web-build /web/dist /usr/share/nginx/html
COPY deploy/render-free/start.py ./free_runtime/start.py
USER app
EXPOSE 10000
HEALTHCHECK --interval=15s --timeout=3s --start-period=90s --retries=5 CMD wget -qO- "http://127.0.0.1:${PORT:-10000}/health" >/dev/null || exit 1
CMD ["python", "free_runtime/start.py"]
