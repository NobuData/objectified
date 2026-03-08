"""REST routes for /v1/auth — login (JWT issuance)."""

import datetime
import logging
from typing import Any

import jwt
from fastapi import APIRouter, HTTPException

from app.auth import decode_jwt  # noqa: F401 - available for re-use
from app.config import settings
from app.database import db
from app.routes.users import _verify_password
from app.schemas.auth import LoginRequest, LoginResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Authentication"])

# Default token lifetime (24 hours)
_JWT_EXPIRY_SECONDS = 86_400


@router.post(
    "/auth/login",
    response_model=LoginResponse,
    summary="Login — issue JWT",
    description=(
        "Authenticate with email and password. "
        "Returns a signed JWT access token valid for 24 hours. "
        "Use the token as ``Authorization: Bearer <token>`` on subsequent requests."
    ),
)
def login(payload: LoginRequest) -> LoginResponse:
    """Authenticate and issue a JWT access token."""
    rows = db.execute_query(
        """
        SELECT id, name, email, password, verified, enabled
        FROM objectified.account
        WHERE LOWER(email) = LOWER(%s)
          AND deleted_at IS NULL
        LIMIT 1
        """,
        (payload.email,),
    )
    if not rows:
        logger.warning("login: unknown email %s", payload.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    account: dict[str, Any] = dict(rows[0])

    if not _verify_password(payload.password, account["password"]):
        logger.warning("login: bad password for email %s", payload.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not account.get("enabled"):
        raise HTTPException(status_code=403, detail="Account is disabled")

    now = datetime.datetime.now(datetime.timezone.utc)
    exp = now + datetime.timedelta(seconds=_JWT_EXPIRY_SECONDS)

    token_data: dict[str, Any] = {
        "sub": str(account["id"]),
        "user_id": str(account["id"]),
        "email": account["email"],
        "name": account["name"],
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }

    try:
        token = jwt.encode(
            token_data,
            settings.effective_jwt_secret,
            algorithm=settings.jwt_algorithm,
        )
    except Exception as exc:
        logger.exception("login: JWT encoding failed")
        raise HTTPException(status_code=500, detail="Failed to issue token") from exc

    logger.info("login: issued JWT for account %s", account["id"])
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        user_id=str(account["id"]),
        email=account["email"],
        name=account["name"],
        expires_in=_JWT_EXPIRY_SECONDS,
    )


