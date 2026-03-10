"""FastAPI application and OpenAPI configuration."""

from typing import Any

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.v1_routes import router as v1_router

app = FastAPI(
    title="Objectified REST API",
    description=(
        "REST API for the Objectified platform. CRUD scaffolding from database design. "
        "Services are used by the platform and can be exposed externally; "
        "internal use is via a private API key."
    ),
    version="1.0.4",
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
        "v1": {
            "users": "/v1/users",
            "tenants": "/v1/tenants",
            "tenant_members": "/v1/tenants/{id}/members",
            "tenant_administrators": "/v1/tenants/{id}/administrators",
        },
    }


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check."""
    return {"status": "ok"}
