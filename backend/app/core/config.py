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

    SSE_HEARTBEAT_INTERVAL: float = float(os.getenv("SSE_HEARTBEAT_INTERVAL", "15.0"))
    PROJECT_NAME: str = "ShipDev Backend"
    VERSION: str = "0.1.0"

    @model_validator(mode="after")
    def validate_security_credentials(self) -> "Settings":
        env = (self.ENVIRONMENT or "development").strip().lower()
        if env == "production":
            # In production, credentials must be explicitly configured and non-placeholder
            if not self.API_SECRET_KEY:
                raise ValueError("Production configuration error: API_SECRET_KEY is required in production.")
            if self.API_SECRET_KEY in INSECURE_PLACEHOLDERS:
                raise ValueError(
                    f"Production configuration error: API_SECRET_KEY cannot use known development placeholder '{self.API_SECRET_KEY}' in production."
                )
            if not self.HUMAN_APPROVAL_SECRET:
                raise ValueError("Production configuration error: HUMAN_APPROVAL_SECRET is required in production.")
            if self.HUMAN_APPROVAL_SECRET in INSECURE_PLACEHOLDERS:
                raise ValueError(
                    f"Production configuration error: HUMAN_APPROVAL_SECRET cannot use known development placeholder '{self.HUMAN_APPROVAL_SECRET}' in production."
                )
            if self.API_SECRET_KEY == self.HUMAN_APPROVAL_SECRET:
                raise ValueError(
                    "Production configuration error: API_SECRET_KEY and HUMAN_APPROVAL_SECRET must be distinct secrets."
                )
        elif env in ("development", "test"):
            # Preserve convenient local development configuration when env vars are unset
            # Explicitly flagged dev keys so they can NEVER be treated as production credentials
            if not self.API_SECRET_KEY:
                self.API_SECRET_KEY = "dev-insecure-local-agent-key"
            if not self.HUMAN_APPROVAL_SECRET:
                self.HUMAN_APPROVAL_SECRET = "dev-insecure-local-human-key"
        return self


settings = Settings()
