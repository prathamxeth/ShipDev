"""Application configuration and security settings."""

import os
from pathlib import Path
from typing import Optional, Set
from dotenv import load_dotenv
from pydantic import BaseModel, model_validator

# Load .env file from project root or backend folder if present
BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR.parent / ".env")
load_dotenv(BASE_DIR / ".env")

INSECURE_PLACEHOLDERS: Set[str] = {
    "dev-agent-secret-change-in-production",
    "dev-human-secret-change-in-production",
    "dev-insecure-local-agent-key",
    "dev-insecure-local-human-key",
    "change-me",
    "secret",
    "password",
    "admin",
    "default",
}


def is_insecure_placeholder(secret: Optional[str]) -> bool:
    """Check case-insensitively with whitespace trimming whether a secret matches known insecure placeholders."""
    if not secret:
        return False
    normalized = secret.strip().lower()
    return normalized in INSECURE_PLACEHOLDERS


class Settings(BaseModel):
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./shipdev.db")
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

    # Machine-to-machine integration key (e.g. Switch agent runners)
    # No insecure hardcoded defaults. Fails closed if absent.
    API_SECRET_KEY: Optional[str] = os.getenv("API_SECRET_KEY")

    # Dedicated secret for human authorization (Strictly isolated from agents and frontend JS)
    # No insecure hardcoded defaults. Fails closed if absent.
    HUMAN_APPROVAL_SECRET: Optional[str] = os.getenv("HUMAN_APPROVAL_SECRET")

    # Server-configured operator identity for human approval, rejection, and completion records
    # Client-supplied reviewer attribution headers/payloads are ignored in favor of this identity.
    HUMAN_OPERATOR_IDENTITY: str = os.getenv("HUMAN_OPERATOR_IDENTITY", "shipdev-operator")

    SSE_HEARTBEAT_INTERVAL: float = float(os.getenv("SSE_HEARTBEAT_INTERVAL", "15.0"))
    PROJECT_NAME: str = "ShipDev Backend"
    VERSION: str = "0.1.0"

    # Platform Integration Credentials
    SLACK_BOT_TOKEN: Optional[str] = os.getenv("SLACK_BOT_TOKEN")
    SLACK_SIGNING_SECRET: Optional[str] = os.getenv("SLACK_SIGNING_SECRET")

    TEAMS_APP_ID: Optional[str] = os.getenv("TEAMS_APP_ID")
    TEAMS_APP_PASSWORD: Optional[str] = os.getenv("TEAMS_APP_PASSWORD")
    TEAMS_WEBHOOK_SECRET: Optional[str] = os.getenv("TEAMS_WEBHOOK_SECRET")
    TEAMS_INCOMING_WEBHOOK_URL: Optional[str] = os.getenv("TEAMS_INCOMING_WEBHOOK_URL")

    DISCORD_BOT_TOKEN: Optional[str] = os.getenv("DISCORD_BOT_TOKEN")
    DISCORD_PUBLIC_KEY: Optional[str] = os.getenv("DISCORD_PUBLIC_KEY")
    DISCORD_WEBHOOK_URL: Optional[str] = os.getenv("DISCORD_WEBHOOK_URL")

    TELEGRAM_BOT_TOKEN: Optional[str] = os.getenv("TELEGRAM_BOT_TOKEN")
    TELEGRAM_WEBHOOK_SECRET: Optional[str] = os.getenv("TELEGRAM_WEBHOOK_SECRET")

    @model_validator(mode="after")
    def validate_security_credentials(self) -> "Settings":
        env = (self.ENVIRONMENT or "development").strip().lower()

        # Sanitize whitespace-only secrets to None
        if self.HUMAN_APPROVAL_SECRET is not None:
            self.HUMAN_APPROVAL_SECRET = self.HUMAN_APPROVAL_SECRET.strip() or None

        if self.API_SECRET_KEY is not None:
            self.API_SECRET_KEY = self.API_SECRET_KEY.strip() or None

        # Sanitize operator identity
        if self.HUMAN_OPERATOR_IDENTITY is not None:
            self.HUMAN_OPERATOR_IDENTITY = self.HUMAN_OPERATOR_IDENTITY.strip() or "shipdev-operator"
        else:
            self.HUMAN_OPERATOR_IDENTITY = "shipdev-operator"

        if env == "production":
            # In production, credentials must be explicitly configured and non-placeholder
            if not self.API_SECRET_KEY:
                raise ValueError("Production configuration error: API_SECRET_KEY is required in production.")
            if is_insecure_placeholder(self.API_SECRET_KEY):
                raise ValueError(
                    "Production configuration error: API_SECRET_KEY cannot use known development placeholder in production."
                )
            if not self.HUMAN_APPROVAL_SECRET:
                raise ValueError("Production configuration error: HUMAN_APPROVAL_SECRET is required in production.")
            if is_insecure_placeholder(self.HUMAN_APPROVAL_SECRET):
                raise ValueError(
                    "Production configuration error: HUMAN_APPROVAL_SECRET cannot use known development placeholder in production."
                )
            if self.API_SECRET_KEY == self.HUMAN_APPROVAL_SECRET:
                raise ValueError(
                    "Production configuration error: API_SECRET_KEY and HUMAN_APPROVAL_SECRET must be distinct secrets."
                )
        # Note: In development and test environments, missing API_SECRET_KEY or HUMAN_APPROVAL_SECRET
        # remain unconfigured (None) and fail closed with HTTP 500 when accessing protected endpoints.
        # No fallback credentials (such as dev-insecure-local-agent-key) are provided.
        return self


settings = Settings()
