"""Application settings loaded from environment variables."""

from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    database_url: Optional[str] = None
    postgres_user: str = "postgres"
    postgres_password: str = "password"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "objectified"

    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = True

    jwt_secret: Optional[str] = None
    nextauth_secret: Optional[str] = None
    jwt_algorithm: str = "HS256"

    readiness_check_database: bool = Field(
        default=True,
        description="If True, GET /ready verifies PostgreSQL with SELECT 1.",
    )

    @property
    def effective_database_url(self) -> str:
        """Database URL, preferring DATABASE_URL over components."""
        if self.database_url:
            return self.database_url
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def effective_jwt_secret(self) -> str:
        """JWT secret, preferring NEXTAUTH_SECRET over JWT_SECRET.
        Raises:
            ValueError: If neither NEXTAUTH_SECRET nor JWT_SECRET is configured.
        """
        secret = self.nextauth_secret or self.jwt_secret
        if not secret:
            raise ValueError(
                "JWT secret is not configured. Set NEXTAUTH_SECRET or JWT_SECRET."
            )
        return secret

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
