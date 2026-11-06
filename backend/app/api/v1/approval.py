"""Human-in-the-loop approval, rejection, and completion REST routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from app.api.deps import get_repository, require_human_caller
from app.core.state_machine import CallerType, TaskStatus
from app.models.task import (
    ApprovalRequest,
    RejectionRequest,
    TaskResponse,
    TransitionRequest,
)
from app.repositories.task_repository import TaskRepository

router = APIRouter(prefix="/tasks", tags=["Approval"])


@router.post("/{task_id}/approve", response_model=TaskResponse)
async def approve_task(
    task_id: str,
    payload: ApprovalRequest,
    caller_auth: tuple[CallerType, str] = Depends(require_human_caller),
    repo: TaskRepository = Depends(get_repository),
):
    """Human engineer approves proposed fix with verified Bearer token.

    Task must be in 'AWAITING_HUMAN_APPROVAL' status.
    Strictly forbidden for AI agents.
    """
    caller_type, reviewer_id = caller_auth
    task = repo.get_task(task_id)

    if task.status != TaskStatus.AWAITING_HUMAN_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot approve task '{task_id}'. Task must be in 'AWAITING_HUMAN_APPROVAL' status, "
                f"but is currently '{task.status.value}'."
            ),
        )

    verified_request = ApprovalRequest(
        reviewer_id=reviewer_id if reviewer_id != "anonymous" else payload.reviewer_id,
        comments=payload.comments,
    )
    return repo.record_human_approval(task_id, verified_request, actor_type=caller_type)


@router.post("/{task_id}/reject", response_model=TaskResponse)
async def reject_task(
    task_id: str,
    payload: RejectionRequest,
    caller_auth: tuple[CallerType, str] = Depends(require_human_caller),
    repo: TaskRepository = Depends(get_repository),
):
    """Human engineer rejects proposed fix with feedback.

    Task must be in 'AWAITING_HUMAN_APPROVAL' status.
    Task returns to FIX_PROPOSED for the fix agent to re-attempt.
    """
    caller_type, reviewer_id = caller_auth
    task = repo.get_task(task_id)

    if task.status != TaskStatus.AWAITING_HUMAN_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot reject task '{task_id}'. Task must be in 'AWAITING_HUMAN_APPROVAL' status, "
                f"but is currently '{task.status.value}'."
            ),
        )

    verified_request = RejectionRequest(
        reviewer_id=reviewer_id if reviewer_id != "anonymous" else payload.reviewer_id,
        feedback=payload.feedback,
        return_to=payload.return_to,
    )
    return repo.record_human_rejection(task_id, verified_request, actor_type=caller_type)


@router.post("/{task_id}/complete", response_model=TaskResponse)
async def complete_task(
    task_id: str,
    caller_auth: tuple[CallerType, str] = Depends(require_human_caller),
    repo: TaskRepository = Depends(get_repository),
):
    """Human engineer marks an already-approved task as COMPLETED.

    Task must be in 'APPROVED' status before it can be marked complete.
    Strictly requires authenticated human credentials.
    """
    caller_type, reviewer_id = caller_auth
    task = repo.get_task(task_id)

    if task.status != TaskStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot complete task '{task_id}'. Task must be in 'APPROVED' status before completion, "
                f"but is currently '{task.status.value}'."
            ),
        )

    repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.COMPLETED,
            actor_type=CallerType.HUMAN,
            actor_id=reviewer_id,
            reason="Human verified final release and completed task.",
        ),
    )
    return repo.get_task(task_id)
