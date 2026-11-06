"""Human-in-the-loop approval and rejection REST routes."""

from fastapi import APIRouter, Depends, status
from app.api.deps import get_repository, require_human_caller
from app.core.state_machine import CallerType
from app.models.task import ApprovalRequest, RejectionRequest, TaskResponse
from app.repositories.task_repository import TaskRepository

router = APIRouter(prefix="/tasks", tags=["Approval"])


@router.post("/{task_id}/approve", response_model=TaskResponse)
async def approve_task(
    task_id: str,
    payload: ApprovalRequest,
    caller_auth: tuple[CallerType, str] = Depends(require_human_caller),
    repo: TaskRepository = Depends(get_repository),
):
    """Human engineer approves proposed fix. Strictly forbidden for AI agents."""
    caller_type, reviewer_id = caller_auth
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
    """Human engineer rejects proposed fix with feedback. Task returns to fix stage."""
    caller_type, reviewer_id = caller_auth
    verified_request = RejectionRequest(
        reviewer_id=reviewer_id if reviewer_id != "anonymous" else payload.reviewer_id,
        feedback=payload.feedback,
        return_to=payload.return_to,
    )
    return repo.record_human_rejection(task_id, verified_request, actor_type=caller_type)

