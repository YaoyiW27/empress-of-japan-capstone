FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PERSONA_DIR=/app/data/ai/personas

WORKDIR /app/backend

RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app --no-create-home app

COPY backend/pyproject.toml backend/README.md ./
COPY backend/app ./app

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir .

COPY backend/alembic.ini ./
COPY backend/alembic ./alembic
COPY backend/db ./db
COPY backend/external_sources.json ./
COPY data/ai/personas /app/data/ai/personas

RUN chown -R app:app /app

USER app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
