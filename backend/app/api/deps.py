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


def get_repository() -> TaskRepository:
    """Yield a TaskRepository instance."""
    return TaskRepository()


def verify_human_bearer_token(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(http_bearer)],
) -> str:
    """Verify that the incoming request contains an authentic human Bearer token.

    Uses constant-time comparison (secrets.compare_digest) to prevent timing attacks.
    Fails closed if no secret is configured server-side.
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

    if not secrets.compare_digest(credentials.credentials, expected_secret):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Invalid human authorization token.",
        )

    return credentials.credentials


def get_caller_identity(
    x_caller_type: Annotated[Optional[str], Header()] = None,
    x_caller_id: Annotated[Optional[str], Header()] = None,
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(http_bearer)] = None,
) -> tuple[CallerType, str]:
    """Extract and authenticate caller identity from incoming HTTP headers.

    'X-Caller-Type: human' is strictly forbidden unless accompanied by a valid Bearer token.
    Without a verified token, attempting to claim human privileges immediately fails closed.
    """
    raw_type = (x_caller_type or "agent").lower()
    actor_id = x_caller_id or "anonymous"

    if raw_type == "human":
        # Authenticate token before granting CallerType.HUMAN
        verify_human_bearer_token(credentials)
        caller_type = CallerType.HUMAN
    elif raw_type == "agent":
        caller_type = CallerType.AGENT
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
    """Enforce that only authenticated human callers with a valid Bearer token can access gated endpoints."""
    actor_id = x_caller_id or "human-reviewer"
    return CallerType.HUMAN, actor_id
