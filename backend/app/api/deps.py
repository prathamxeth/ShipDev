"""FastAPI dependency injection utilities."""

from typing import Annotated, Optional
from fastapi import Header, HTTPException, status
from app.core.state_machine import CallerType
from app.repositories.task_repository import TaskRepository


def get_repository() -> TaskRepository:
    """Yield a TaskRepository instance."""
    return TaskRepository()


def get_caller_identity(
    x_caller_type: Annotated[Optional[str], Header()] = None,
    x_caller_id: Annotated[Optional[str], Header()] = None,
) -> tuple[CallerType, str]:
    """Extract and validate caller identity from incoming HTTP headers."""
    raw_type = (x_caller_type or "agent").lower()
    actor_id = x_caller_id or "anonymous"

    if raw_type == "human":
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
    x_caller_type: Annotated[Optional[str], Header()] = None,
    x_caller_id: Annotated[Optional[str], Header()] = None,
) -> tuple[CallerType, str]:
    """Enforce that only authenticated human callers may access gated endpoints."""
    caller_type, actor_id = get_caller_identity(x_caller_type, x_caller_id)
    if caller_type != CallerType.HUMAN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security Violation: This action requires human authorization. AI agents are forbidden.",
        )
    return caller_type, actor_id

