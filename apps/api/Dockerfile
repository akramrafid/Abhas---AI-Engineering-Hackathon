# Abhas FastAPI + LightGBM API container (non-root, Linux OpenMP built in)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    APP_ENV=dev \
    DATABASE_URL=sqlite:////app/data/abhas.db \
    MODEL_PATH=/app/apps/api/ml/artifacts/current.joblib \
    RAW_DATASET_PATH=/app/data/raw/hackathon_preli_dataset.xlsx

# LightGBM requires libgomp1 (Linux OpenMP runtime)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin abhas

WORKDIR /app

# Install runtime Python dependencies only (training dependencies stay out of the serving image)
COPY apps/api/requirements.txt /app/apps/api/requirements.txt
RUN pip install --no-cache-dir --require-hashes --only-binary=:all: -r /app/apps/api/requirements.txt

COPY apps/api /app/apps/api
COPY data/raw /app/data/raw
COPY contracts/openapi.json /app/contracts/openapi.json

RUN mkdir -p /app/data && chown -R abhas:abhas /app

USER abhas
WORKDIR /app/apps/api

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/readyz', timeout=3)"

CMD ["sh", "-c", "python -m alembic upgrade head && python -m scripts.seed && python -m ml.verify_artifact && python -m app --host 0.0.0.0 --port ${API_PORT:-8000} --no-reload"]
