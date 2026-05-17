FROM python:3.11-slim

WORKDIR /app

# System deps for psycopg binary and feedparser
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    python3-feedparser \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps without telethon (requires sgmllib3k which fails to build)
# Telethon is added separately when needed
COPY pyproject.toml .
RUN pip install --no-cache-dir \
    "psycopg[binary]>=3.2" \
    "psycopg-pool>=3.2" \
    "httpx>=0.27" \
    "feedparser>=6.0" \
    "anthropic>=0.40" \
    "pydantic>=2.9" \
    "pydantic-settings>=2.5" \
    "structlog>=24.4" \
    "tenacity>=9.0"

# Install the package itself
COPY sentinel/ sentinel/
RUN pip install --no-cache-dir --no-deps -e .

# Default: run the worker. Override CMD to run scheduler instead.
CMD ["sentinel-worker"]
