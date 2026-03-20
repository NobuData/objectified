# Objectified REST API

REST API scaffolding for the Objectified platform. Uses the database design for all tables; services are consumed by the platform and can be exposed externally. Internal use is via a private API key.

## Requirements

- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Python 3.11+

## Setup

```bash
cd objectified-rest
uv sync
```

This creates a virtual environment, installs dependencies, and generates `uv.lock` if missing. To include dev dependencies (pytest, httpx):

```bash
uv sync --group dev
```

## Run

```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

OpenAPI docs: http://localhost:8000/docs

## Health probes (Kubernetes / load balancers)

| Path | Purpose |
|------|---------|
| `GET /health` | **Liveness** — no dependency checks; use when the process should be restarted if unresponsive. |
| `GET /ready` | **Readiness** — by default runs `SELECT 1` against PostgreSQL; returns **503** if the DB is unreachable. |

To run readiness without a database check (e.g. bootstrap or custom probes), set:

```bash
READINESS_CHECK_DATABASE=false
```

## Observability (logging, tracing, rate limits)

### Structured logs

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_FORMAT` | `text` | Set to `json` for one JSON object per line (good for aggregators). |
| `LOG_LEVEL` | `INFO` | Root log level. |
| `LOG_HTTP_REQUESTS` | `true` | One access log per request (`request_completed`). Probes `GET /health` and `GET /ready` are omitted to reduce noise. |

JSON lines include `request_id`, `trace_id`, and after authentication `tenant_slug`, `user_id`, and `auth_method` when known. Application code can use the standard `logging` module; those fields are merged from request context when present.

### Request and trace correlation

- **X-Request-ID**: Echoed on every response. If the client sends `X-Request-ID`, that value is kept; otherwise the server generates a UUID.
- **traceparent** (W3C): If present, the trace id is parsed and echoed as **X-Trace-ID** (32-char hex).
- **X-Trace-ID**: Used when `traceparent` is absent; if neither is sent, a new trace id is generated.

### OpenTelemetry (optional)

Install OTLP export support:

```bash
uv sync --group otel
```

When **`OTEL_EXPORTER_OTLP_ENDPOINT`** is set to an OTLP **HTTP** traces URL (for example `http://localhost:4318/v1/traces`), the app registers FastAPI tracing and exports spans. Optional: **`OTEL_SERVICE_NAME`** overrides the default service name (`objectified-rest` is used via settings).

If the endpoint is set but the `otel` group is not installed, a warning is logged at startup.

### Rate limiting (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_ENABLED` | `false` | Enable in-process sliding-window limits per client IP. |
| `RATE_LIMIT_PER_MINUTE` | `120` | Max requests per IP per rolling 60 seconds. |

`GET /health`, `GET /ready`, and `/docs` are never rate-limited. On limit, responses use **429** and a `Retry-After: 60` header.

## Tests

```bash
uv run pytest tests -v
```

## Generate OpenAPI 3.2.0 specification

Generate static OpenAPI 3.2.0 files from the server REST definition:

```bash
uv run python scripts/generate_openapi.py
```

Writes `openapi/openapi.json` and `openapi/openapi.yaml` (YAML requires `uv sync --group dev`).

## Structure

- `src/app/schemas/` – Pydantic schemas representing database tables (objectified schema)
- `src/app/auth.py` – JWT and API key validation (reference: objectified-commercial)
- Routes (documented in OpenAPI): `/v1/users`, `/v1/tenants`, `/v1/tenants/{id}/members`, `/v1/tenants/{id}/administrators`
