import os
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env file from project root or backend folder if present
BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR.parent / ".env")
load_dotenv(BASE_DIR / ".env")


class Settings(BaseModel):
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./shipdev.db")
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
    # Machine-to-machine integration key (e.g. Switch agent runners)
    API_SECRET_KEY: str = os.getenv("API_SECRET_KEY", "dev-agent-secret-change-in-production")
    # Dedicated secret for human authorization (Strictly isolated from agents and frontend JS)
    HUMAN_APPROVAL_SECRET: str = os.getenv("HUMAN_APPROVAL_SECRET", "dev-human-secret-change-in-production")
    SSE_HEARTBEAT_INTERVAL: float = float(os.getenv("SSE_HEARTBEAT_INTERVAL", "15.0"))
    PROJECT_NAME: str = "ShipDev Backend"
    VERSION: str = "0.1.0"


settings = Settings()
