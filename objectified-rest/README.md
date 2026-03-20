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

- **X-Request-ID**: Echoed on all successful and handled error responses. If the client sends `X-Request-ID`, that value is kept (provided it passes validation); otherwise the server generates a UUID. On unhandled 5xx errors generated outside the normal middleware pipeline this header may be missing.
- **traceparent** (W3C): If present, the trace id is parsed and echoed as **X-Trace-ID** (32-char hex) on successful and handled responses.
- **X-Trace-ID**: Used when `traceparent` is absent; if neither is sent, a new trace id is generated and echoed on successful and handled responses. On unhandled 5xx errors this header may be missing.

### OpenTelemetry (optional)

Install OTLP export support:

```bash
uv sync --group otel
```

When **`OTEL_EXPORTER_OTLP_ENDPOINT`** is set to an OTLP **HTTP** traces URL (for example `http://localhost:4318/v1/traces`), the app registers FastAPI tracing and exports spans. Optional: **`OTEL_SERVICE_NAME`** overrides the default service name (`objectified-rest` is used via settings).

If the endpoint is set but the `otel` group is not installed, a warning is logged at startup.

### Rate limiting and quotas (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_ENABLED` | `false` | Enable in-process sliding-window limits (see below). |
| `RATE_LIMIT_PER_MINUTE` | `120` | Default max requests per rolling 60s when no tenant/API-key override applies. |

When `RATE_LIMIT_ENABLED=true`:

- **API key** requests (`X-API-Key`): limit is `api_key.rate_limit_requests_per_minute`, else `tenant.rate_limit_requests_per_minute`, else `RATE_LIMIT_PER_MINUTE`.
- **JWT** requests: if the path starts with `/v1/tenants/{tenant_id}/` and the user is a member of that tenant, the tenant RPM column applies (otherwise this default). Other JWT routes use `RATE_LIMIT_PER_MINUTE` per user (`sub`).
- **Anonymous** requests: per client IP using `RATE_LIMIT_PER_MINUTE`.

`GET /health`, `GET /ready`, `/docs`, `/openapi.json`, and `/openapi.yaml` are not rate-limited. On limit, responses use **429** with a `Retry-After` header (seconds until the oldest event in the window expires).

**Quotas** (optional, schema migration `20260319-182829.sql`): `tenant.max_projects` and `tenant.max_versions_per_project` cap new projects and new versions per project. Over-quota creates return **403** with a clear message. Set via `PUT /v1/tenants/{id}` (platform admin) using `max_projects` / `max_versions_per_project`; send JSON `null` to clear a cap.

**Operations notes**: Apply the migration before using new columns. Tune `RATE_LIMIT_PER_MINUTE` as a global default; tighten per integration with API-key RPM or per-tenant RPM. Monitor **429** rates and quota **403**s in access logs (`request_completed` includes status). Horizontal scaling does not share in-memory counters—use a shared store (e.g. Redis) if you need cluster-wide limits.

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
