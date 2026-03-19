"""FastAPI application and OpenAPI configuration."""

from typing import Any

import yaml
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from app.config import settings
from app.database import db
from app.v1_routes import router as v1_router

app = FastAPI(
    title="Objectified REST API",
    description=(
        "REST API for the Objectified platform. CRUD scaffolding from database design. "
        "Services are used by the platform and can be exposed externally; "
        "internal use is via a private API key."
    ),
    version="1.0.16",
    openapi_version="3.2.0",
    openapi_url="/openapi.yaml",
)


def _openapi_yaml_endpoint(_request: Any) -> Response:
    """Serve OpenAPI 3.2.0 spec as YAML for Swagger UI."""
    schema = app.openapi()
    body = yaml.dump(
        schema,
        sort_keys=False,
        default_flow_style=False,
        allow_unicode=True,
    )
    return Response(
        content=body,
        media_type="application/x-yaml",
    )


# Register /openapi.yaml first so Swagger UI loads YAML from this URL
app.add_route(
    "/openapi.yaml",
    _openapi_yaml_endpoint,
    methods=["GET"],
    include_in_schema=False,
)


def custom_openapi() -> dict[str, Any]:
    """Add security schemes (JWT and API key) to OpenAPI schema. Emits OpenAPI 3.2.0."""
    if app.openapi_schema:
        return app.openapi_schema
    from fastapi.openapi.utils import get_openapi

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        openapi_version="3.2.0",
        description=app.description,
        routes=app.routes,
    )
    openapi_schema.setdefault("components", {})
    openapi_schema["components"]["securitySchemes"] = {
        "Bearer": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT token from NextAuth (Authorization: Bearer <token>)",
        },
        "ApiKey": {
            "type": "apiKey",
            "in": "header",
            "name": "X-API-Key",
            "description": "API key for tenant-scoped access (alternative to JWT)",
        },
    }
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi

# Serve OpenAPI as JSON for /openapi.json (Swagger uses /openapi.yaml)
@app.get("/openapi.json", include_in_schema=False)
async def openapi_json() -> dict[str, Any]:
    """Serve OpenAPI 3.2.0 spec as JSON."""
    return app.openapi()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router)


@app.get("/")
async def root() -> dict[str, Any]:
    """Root endpoint."""
    return {
        "message": "Objectified REST API",
        "version": "1.0.0",
        "docs": "/docs",
        "openapi": "/openapi.yaml",
        "openapi_json": "/openapi.json",
        "health": "/health",
        "ready": "/ready",
        "v1": {
            "users": "/v1/users",
            "tenants": "/v1/tenants",
            "tenant_members": "/v1/tenants/{id}/members",
            "tenant_administrators": "/v1/tenants/{id}/administrators",
        },
    }


@app.get(
    "/health",
    tags=["Operations"],
    summary="Liveness probe",
    description=(
        "Lightweight liveness check for orchestrators and load balancers. "
        "Does not verify external dependencies; use ``GET /ready`` for that."
    ),
    responses={200: {"description": "Process is alive"}},
)
async def health() -> dict[str, str]:
    """Kubernetes-style liveness: process is up."""
    return {"status": "ok"}


@app.get(
    "/ready",
    tags=["Operations"],
    summary="Readiness probe",
    description=(
        "Returns 200 when the service can handle traffic. By default runs a PostgreSQL "
        "``SELECT 1`` check. Set environment variable ``READINESS_CHECK_DATABASE=false`` "
        "to skip the database check (process-only readiness)."
    ),
    responses={
        200: {"description": "Ready to accept traffic"},
        503: {"description": "Not ready — dependency check failed"},
    },
)
async def ready() -> Any:
    """Readiness: optional database connectivity."""
    checks: dict[str, str] = {}
    if not settings.readiness_check_database:
        checks["database"] = "skipped"
        return {"status": "ready", "checks": checks}
    if db.ping():
        checks["database"] = "ok"
        return {"status": "ready", "checks": checks}
    checks["database"] = "unavailable"
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"status": "not_ready", "checks": checks},
    )
