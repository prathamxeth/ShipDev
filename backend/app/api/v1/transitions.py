"""State transition REST routes."""

from fastapi import APIRouter, Depends, Header, status
from app.api.deps import get_caller_identity, get_repository
from app.core.state_machine import CallerType, TaskStatus
from app.models.task import TransitionRequest, TransitionResponse
from app.repositories.task_repository import TaskRepository

router = APIRouter(prefix="/tasks", tags=["Transitions"])


@router.post("/{task_id}/transitions", response_model=TransitionResponse)
async def transition_task(
    task_id: str,
    payload: TransitionRequest,
    caller_auth: tuple[CallerType, str] = Depends(get_caller_identity),
    repo: TaskRepository = Depends(get_repository),
):
    """Execute a state transition for a task, verifying caller permissions and transition rules.

    The authenticated caller type from headers takes precedence over the payload.
    """
    caller_type, caller_id = caller_auth
    # Use verified caller identity from header if provided
    verified_request = TransitionRequest(
        target_status=payload.target_status,
        actor_type=caller_type,
        actor_id=caller_id if caller_id != "anonymous" else payload.actor_id,
        reason=payload.reason,
        evidence_id=payload.evidence_id,
    )
    return repo.record_transition(task_id, verified_request)

