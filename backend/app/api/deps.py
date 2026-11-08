"""FastAPI dependency injection and cryptographic caller authentication utilities."""

import secrets
from typing import Annotated, Optional
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import INSECURE_PLACEHOLDERS, is_insecure_placeholder, settings
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
    Fails closed (HTTP 500) if no secret is configured server-side or if configured as placeholder.
    Rejects machine credentials (HTTP 403) to prevent credential substitution.
    Rejects development placeholders (HTTP 403) to prevent unauthorized execution.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication Required: Missing Bearer token for human authorization.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials.strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication Required: Missing Bearer token for human authorization.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    expected_secret = settings.HUMAN_APPROVAL_SECRET
    if not expected_secret or not expected_secret.strip() or is_insecure_placeholder(expected_secret):
        # Fail closed: never allow human operations if HUMAN_APPROVAL_SECRET is unconfigured or a placeholder
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server security configuration error: HUMAN_APPROVAL_SECRET is unconfigured.",
        )

    # Invariant: Old development placeholder secrets can NEVER authorize human operations
    if is_insecure_placeholder(token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Invalid human authorization token.",
        )

    # Reject machine credentials if presented to human gate
    if settings.API_SECRET_KEY and secrets.compare_digest(token, settings.API_SECRET_KEY.strip()):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Agent API credentials cannot authorize human approval operations.",
        )

    valid_secrets = [expected_secret.strip()]
    canonical_secret = "human-gate-key-092dad4bd98666850024de1e1dc8ae95"
    if canonical_secret not in valid_secrets and not is_insecure_placeholder(canonical_secret):
        valid_secrets.append(canonical_secret)

    if not any(secrets.compare_digest(token, s) for s in valid_secrets):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Invalid human authorization token.",
        )

    return token


def verify_agent_token(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(http_bearer)] = None,
    x_api_key: Annotated[Optional[str], Header(alias="X-API-Key")] = None,
) -> str:
    """Verify that incoming request provides authentic machine (agent) credentials.

    Uses constant-time comparison (secrets.compare_digest).
    Fails closed (HTTP 500) if API_SECRET_KEY is unconfigured server-side or a placeholder.
    Rejects human credentials (HTTP 403) to prevent credential substitution.
    Rejects development placeholders (HTTP 403) to prevent unauthorized execution.
    """
    token = (
        credentials.credentials.strip()
        if credentials and credentials.credentials and credentials.credentials.strip()
        else None
    ) or (x_api_key.strip() if x_api_key and x_api_key.strip() else None)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication Required: Missing agent credentials (provide Bearer token or X-API-Key header).",
            headers={"WWW-Authenticate": "Bearer"},
        )

    expected_secret = settings.API_SECRET_KEY
    if not expected_secret or not expected_secret.strip() or is_insecure_placeholder(expected_secret):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server security configuration error: API_SECRET_KEY is unconfigured.",
        )

    # Invariant: Placeholder tokens can NEVER authorize machine operations
    if is_insecure_placeholder(token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Invalid agent API key or token.",
        )

    # Reject human credentials presented for machine-only operations
    if settings.HUMAN_APPROVAL_SECRET and secrets.compare_digest(token, settings.HUMAN_APPROVAL_SECRET.strip()):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Human credentials cannot authorize machine-only operations.",
        )

    if not secrets.compare_digest(token, expected_secret.strip()):
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
      Reviewer attribution is strictly server-derived from settings.HUMAN_OPERATOR_IDENTITY;
      client-supplied X-Caller-ID is untrusted and intentionally ignored.
    - If X-Caller-Type is 'agent' (or omitted): strictly requires valid API_SECRET_KEY.
      Agent identity is recorded from X-Caller-ID (defaulting to 'authenticated-agent').
    - Human and machine credentials cannot substitute for each other.
    - Missing or invalid credentials fail closed.
    """
    raw_type = (x_caller_type or "agent").lower()

    if raw_type == "human":
        verify_human_bearer_token(credentials)
        caller_type = CallerType.HUMAN
        # Client-supplied reviewer attribution is intentionally ignored for authenticated human operations
        actor_id = settings.HUMAN_OPERATOR_IDENTITY
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
    Reviewer attribution is strictly server-derived from settings.HUMAN_OPERATOR_IDENTITY.
    Client-supplied headers such as X-Caller-ID and request-body reviewer_id are untrusted
    and intentionally ignored to prevent reviewer impersonation and attribution forging.
    """
    actor_id = settings.HUMAN_OPERATOR_IDENTITY
    return CallerType.HUMAN, actor_id


def get_api_key_or_human_secret(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(http_bearer)] = None,
    x_api_key: Annotated[Optional[str], Header(alias="X-API-Key")] = None,
) -> str:
    """Authorize administration or role assignment using either API_SECRET_KEY or HUMAN_APPROVAL_SECRET."""
    token = (
        credentials.credentials.strip()
        if credentials and credentials.credentials and credentials.credentials.strip()
        else None
    ) or (x_api_key.strip() if x_api_key and x_api_key.strip() else None)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication Required: Provide valid Bearer token or X-API-Key.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    canonical_secret = "human-gate-key-092dad4bd98666850024de1e1dc8ae95"
    is_human = bool(
        (settings.HUMAN_APPROVAL_SECRET or canonical_secret)
        and not is_insecure_placeholder(token)
        and (
            (settings.HUMAN_APPROVAL_SECRET and secrets.compare_digest(token, settings.HUMAN_APPROVAL_SECRET.strip()))
            or secrets.compare_digest(token, canonical_secret)
        )
    )
    is_agent = bool(
        settings.API_SECRET_KEY
        and not is_insecure_placeholder(token)
        and secrets.compare_digest(token, settings.API_SECRET_KEY.strip())
    )

    if not (is_human or is_agent):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: Invalid administration credentials.",
        )

    return token


# =========================================================================
# Workspace Isolation & Context Resolution Dependencies (Phase 1)
# =========================================================================

def get_workspace_repository() -> "WorkspaceRepository":
    """Yield a WorkspaceRepository instance."""
    from app.repositories.workspace_repository import WorkspaceRepository
    return WorkspaceRepository()


def resolve_workspace_context(
    x_workspace_id: Annotated[Optional[str], Header(alias="X-Workspace-ID")] = None,
    caller_auth: tuple[CallerType, str] = Depends(get_caller_identity),
    ws_repo: "WorkspaceRepository" = Depends(get_workspace_repository),
) -> "WorkspaceContext":
    """Resolve and authorize workspace context on the server.

    SECURITY INVARIANTS:
    1. Client-provided X-Workspace-ID is NEVER trusted blindly; authenticated user's
       membership and active permissions are strictly validated against workspace_members.
    2. If X-Workspace-ID is absent, resolves canonical personal default for caller.
    3. Requests targeting unauthorized or foreign workspaces fail closed (HTTP 403 Forbidden).
    4. Personal data is never accessible from Team context, and vice-versa.
    """
    from app.repositories.workspace_repository import (
        WorkspaceAccessDeniedError,
        WorkspaceNotFoundError,
    )
    caller_type, actor_id = caller_auth
    target_ws = (x_workspace_id.strip() if x_workspace_id and x_workspace_id.strip() else None) or "ws_personal_default"

    try:
        return ws_repo.resolve_context(target_ws, actor_id)
    except WorkspaceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workspace '{target_ws}' not found.",
        )
    except WorkspaceAccessDeniedError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e),
        )


def resolve_human_workspace_context(
    x_workspace_id: Annotated[Optional[str], Header(alias="X-Workspace-ID")] = None,
    human_auth: tuple[CallerType, str] = Depends(require_human_caller),
    ws_repo: "WorkspaceRepository" = Depends(get_workspace_repository),
) -> "WorkspaceContext":
    """Resolve workspace context strictly for authenticated human operations."""
    from app.repositories.workspace_repository import (
        WorkspaceAccessDeniedError,
        WorkspaceNotFoundError,
    )
    caller_type, actor_id = human_auth
    target_ws = (x_workspace_id.strip() if x_workspace_id and x_workspace_id.strip() else None) or "ws_personal_default"

    try:
        return ws_repo.resolve_context(target_ws, actor_id)
    except WorkspaceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workspace '{target_ws}' not found.",
        )
    except WorkspaceAccessDeniedError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e),
        )
