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
