"""State transition REST routes."""

from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from app.api.deps import get_caller_identity, get_repository
from app.core.state_machine import CallerType, TaskStatus
from app.models.task import TransitionRequest, TransitionResponse
from app.repositories.task_repository import TaskRepository

router = APIRouter(prefix="/tasks", tags=["Transitions"])


@router.post("/{task_id}/transitions", response_model=TransitionResponse)
async def transition_task(
    task_id: str,
    payload: TransitionRequest,
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    caller_auth: tuple[CallerType, str] = Depends(get_caller_identity),
    repo: TaskRepository = Depends(get_repository),
):
    """Execute a state transition for a task, verifying caller permissions and transition rules.

    AI agents can advance workflow states up to AWAITING_HUMAN_APPROVAL.
    Direct transitions to 'APPROVED' or 'COMPLETED' via /transitions are strictly blocked.
    """
    if payload.target_status in {TaskStatus.APPROVED, TaskStatus.COMPLETED}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Direct transition to '{payload.target_status.value}' via /transitions is forbidden. "
                "Approvals must be submitted through POST /api/v1/tasks/{task_id}/approve and "
                "completions through POST /api/v1/tasks/{task_id}/complete."
            ),
        )

    caller_type, caller_id = caller_auth
    verified_request = TransitionRequest(
        target_status=payload.target_status,
        actor_type=caller_type,
        actor_id=caller_id,
        reason=payload.reason,
        evidence_id=payload.evidence_id,
    )
    transition_result = repo.record_transition(task_id, verified_request, workspace_id=x_workspace_id)

    # If the task reached AWAITING_HUMAN_APPROVAL and is conversation-linked, dispatch review card
    if payload.target_status == TaskStatus.AWAITING_HUMAN_APPROVAL:
        try:
            from app.services.review_dispatcher import ReviewDispatcher
            ReviewDispatcher(task_repo=repo).dispatch_review_request(task_id)
        except Exception:
            pass

    return transition_result
