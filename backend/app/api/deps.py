"""FastAPI dependency injection and cryptographic caller authentication utilities."""

import secrets
from typing import Annotated, Optional
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.core.state_machine import CallerType
from app.repositories.task_repository import TaskRepository

# OpenAPI Bearer security scheme (auto_error=False to allow custom RFC 6750 error responses)
http_bearer = HTTPBearer(auto_error=False)

DEMO_HUMAN_IDENTITY_PREFIX = "demo-human-proxy"


def get_repository() -> TaskRepository:
    """Yield a TaskRepository instance."""
    return TaskRepository()


def verify_human_bearer_token(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(http_bearer)],
) -> str:
    """Verify that incoming request contains an authentic human Bearer token.

    Uses constant-time comparison (secrets.compare_digest) to prevent timing attacks.
    Fails closed (HTTP 500) if no secret is configured server-side.
    Rejects machine credentials (HTTP 403) to prevent credential substitution.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication Required: Missing Bearer token for human authorization.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    expected_secret = settings.HUMAN_APPROVAL_SECRET
    if not expected_secret:
        # Fail closed: never allow human operations if HUMAN_APPROVAL_SECRET is unconfigured
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server security configuration error: HUMAN_APPROVAL_SECRET is unconfigured.",
        )

    # Reject machine credentials if presented to human gate
    if settings.API_SECRET_KEY and secrets.compare_digest(credentials.credentials, settings.API_SECRET_KEY):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Agent API credentials cannot authorize human approval operations.",
        )

    if not secrets.compare_digest(credentials.credentials, expected_secret):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Invalid human authorization token.",
        )

    return credentials.credentials


def verify_agent_token(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(http_bearer)] = None,
    x_api_key: Annotated[Optional[str], Header(alias="X-API-Key")] = None,
) -> str:
    """Verify that incoming request provides authentic machine (agent) credentials.

    Uses constant-time comparison (secrets.compare_digest).
    Fails closed (HTTP 500) if API_SECRET_KEY is unconfigured server-side.
    Rejects human credentials (HTTP 403) to prevent credential substitution.
    """
    token = (credentials.credentials if credentials and credentials.credentials else None) or (
        x_api_key.strip() if x_api_key else None
    )
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication Required: Missing agent credentials (provide Bearer token or X-API-Key header).",
            headers={"WWW-Authenticate": "Bearer"},
        )

    expected_secret = settings.API_SECRET_KEY
    if not expected_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server security configuration error: API_SECRET_KEY is unconfigured.",
        )

    # Reject human credentials presented for machine-only operations
    if settings.HUMAN_APPROVAL_SECRET and secrets.compare_digest(token, settings.HUMAN_APPROVAL_SECRET):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Human credentials cannot authorize machine-only operations.",
        )

    if not secrets.compare_digest(token, expected_secret):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Invalid agent API key or token.",
        )

    return token


def get_caller_identity(
    x_caller_type: Annotated[Optional[str], Header()] = None,
    x_caller_id: Annotated[Optional[str], Header()] = None,
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(http_bearer)] = None,
    x_api_key: Annotated[Optional[str], Header(alias="X-API-Key")] = None,
) -> tuple[CallerType, str]:
    """Extract and cryptographically authenticate caller identity from incoming HTTP headers and tokens.

    - If X-Caller-Type is 'human': strictly requires valid HUMAN_APPROVAL_SECRET Bearer token.
    - If X-Caller-Type is 'agent' (or omitted): strictly requires valid API_SECRET_KEY.
    - X-Caller-ID is unverified; human callers are recorded as explicitly labelled demo/proxy identities.
    - Human and machine credentials cannot substitute for each other.
    - Missing or invalid credentials fail closed.
    """
    raw_type = (x_caller_type or "agent").lower()

    if raw_type == "human":
        verify_human_bearer_token(credentials)
        caller_type = CallerType.HUMAN
        actor_id = (
            f"{DEMO_HUMAN_IDENTITY_PREFIX}:claimed-{x_caller_id.strip()}"
            if x_caller_id and x_caller_id.strip()
            else DEMO_HUMAN_IDENTITY_PREFIX
        )
    elif raw_type == "agent":
        verify_agent_token(credentials, x_api_key)
        caller_type = CallerType.AGENT
        actor_id = x_caller_id.strip() if x_caller_id and x_caller_id.strip() else "authenticated-agent"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid X-Caller-Type header '{x_caller_type}'. Must be 'human' or 'agent'.",
        )

    return caller_type, actor_id


def require_human_caller(
    x_caller_id: Annotated[Optional[str], Header()] = None,
    token: str = Depends(verify_human_bearer_token),
) -> tuple[CallerType, str]:
    """Enforce that only authenticated human callers with a valid Bearer token can access gated endpoints.

    SECURITY INVARIANT:
    The shared Bearer token establishes caller authorization via the demo proxy secret;
    it does NOT verify individual human identity. X-Caller-ID is untrusted and cannot establish
    a verified identity. The recorded actor_id is explicitly labelled as a demo proxy identity.
    """
    if x_caller_id and x_caller_id.strip():
        actor_id = f"{DEMO_HUMAN_IDENTITY_PREFIX}:claimed-{x_caller_id.strip()}"
    else:
        actor_id = DEMO_HUMAN_IDENTITY_PREFIX

    return CallerType.HUMAN, actor_id
