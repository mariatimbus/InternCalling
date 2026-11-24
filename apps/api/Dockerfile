# syntax=docker/dockerfile:1
# Production image for the FastAPI backend. Build context: apps/api
FROM ghcr.io/astral-sh/uv:0.11.8 AS uv

FROM python:3.13-slim-bookworm AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app
# Dependencies first so source edits reuse the cached layer.
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.13-slim-bookworm
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=build --chown=root:root /app/.venv /app/.venv
ENV PATH=/app/.venv/bin:$PATH PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PORT=8000
USER 10001
EXPOSE 8000
# --proxy-headers: Render terminates TLS; the rate limiter must see the real client IP,
# not the shared proxy address. The container is only reachable through that proxy.
CMD ["sh", "-c", "exec uvicorn opportunity_api.main:app --host 0.0.0.0 --port \"$PORT\" --proxy-headers --forwarded-allow-ips='*' --no-server-header"]
