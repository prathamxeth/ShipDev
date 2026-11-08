"""Human-in-the-loop approval, rejection, and completion REST routes."""

from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from app.api.deps import get_repository, require_human_caller
from app.core.state_machine import CallerType, TaskStatus
from app.models.task import (
    ApprovalRequest,
    RejectionRequest,
    TaskResponse,
    TransitionRequest,
)
from app.repositories.task_repository import TaskRepository
from app.repositories.workspace_repository import WorkspaceRepository
from app.models.workspace import WorkspaceType

router = APIRouter(prefix="/tasks", tags=["Approval"])


@router.post("/{task_id}/approve", response_model=TaskResponse)
async def approve_task(
    task_id: str,
    payload: ApprovalRequest,
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    caller_auth: tuple[CallerType, str] = Depends(require_human_caller),
    repo: TaskRepository = Depends(get_repository),
):
    """Human engineer approves proposed fix with verified Bearer token.

    Task must be in 'AWAITING_HUMAN_APPROVAL' status within authorized workspace.
    Strictly forbidden for AI agents.
    Reviewer attribution is server-derived from settings.HUMAN_OPERATOR_IDENTITY.
    Client-supplied payload.reviewer_id and X-Caller-ID are intentionally ignored.
    """
    caller_type, reviewer_id = caller_auth
    task = repo.get_task(task_id, workspace_id=x_workspace_id)

    target_ws = (x_workspace_id or task.workspace_id or "ws_personal_default").strip()
    ws_resolver = WorkspaceRepository(db_path=repo.db_path) if repo.db_path else WorkspaceRepository()
    try:
        ws = ws_resolver.get_workspace(target_ws)
        if ws.workspace_type == WorkspaceType.TEAM:
            is_authorized = bool(
                ws_resolver.get_member(target_ws, reviewer_id)
                or reviewer_id in {"local-operator", "shipdev-operator", settings.HUMAN_OPERATOR_IDENTITY}
                or ws.owner_user_id in {reviewer_id, "local-operator", "shipdev-operator", settings.HUMAN_OPERATOR_IDENTITY}
            )
            if not is_authorized:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access Denied: User '{reviewer_id}' is not an authorized member of team workspace '{target_ws}'.",
                )
    except HTTPException:
        raise
    except Exception:
        pass

    if task.status != TaskStatus.AWAITING_HUMAN_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot approve task '{task_id}'. Task must be in 'AWAITING_HUMAN_APPROVAL' status, "
                f"but is currently '{task.status.value}'."
            ),
        )

    # Server-derived operator identity is enforced; payload.reviewer_id is ignored.
    verified_request = ApprovalRequest(
        reviewer_id=reviewer_id,
        comments=payload.comments,
    )
    return repo.record_human_approval(task_id, verified_request, actor_type=caller_type, workspace_id=x_workspace_id)


@router.post("/{task_id}/reject", response_model=TaskResponse)
async def reject_task(
    task_id: str,
    payload: RejectionRequest,
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    caller_auth: tuple[CallerType, str] = Depends(require_human_caller),
    repo: TaskRepository = Depends(get_repository),
):
    """Human engineer rejects proposed fix with feedback within authorized workspace.

    Task must be in 'AWAITING_HUMAN_APPROVAL' status.
    Task returns to FIX_PROPOSED for the fix assistant to re-attempt.
    Reviewer attribution is server-derived from settings.HUMAN_OPERATOR_IDENTITY.
    Client-supplied payload.reviewer_id and X-Caller-ID are intentionally ignored.
    """
    caller_type, reviewer_id = caller_auth
    task = repo.get_task(task_id, workspace_id=x_workspace_id)

    target_ws = (x_workspace_id or task.workspace_id or "ws_personal_default").strip()
    ws_resolver = WorkspaceRepository(db_path=repo.db_path) if repo.db_path else WorkspaceRepository()
    try:
        ws = ws_resolver.get_workspace(target_ws)
        if ws.workspace_type == WorkspaceType.TEAM:
            is_authorized = bool(
                ws_resolver.get_member(target_ws, reviewer_id)
                or reviewer_id in {"local-operator", "shipdev-operator", settings.HUMAN_OPERATOR_IDENTITY}
                or ws.owner_user_id in {reviewer_id, "local-operator", "shipdev-operator", settings.HUMAN_OPERATOR_IDENTITY}
            )
            if not is_authorized:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access Denied: User '{reviewer_id}' is not an authorized member of team workspace '{target_ws}'.",
                )
    except HTTPException:
        raise
    except Exception:
        pass

    if task.status != TaskStatus.AWAITING_HUMAN_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot reject task '{task_id}'. Task must be in 'AWAITING_HUMAN_APPROVAL' status, "
                f"but is currently '{task.status.value}'."
            ),
        )

    # Server-derived operator identity is enforced; payload.reviewer_id is ignored.
    verified_request = RejectionRequest(
        reviewer_id=reviewer_id,
        feedback=payload.feedback,
        return_to=payload.return_to,
    )
    return repo.record_human_rejection(task_id, verified_request, actor_type=caller_type, workspace_id=x_workspace_id)


@router.post("/{task_id}/complete", response_model=TaskResponse)
async def complete_task(
    task_id: str,
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    caller_auth: tuple[CallerType, str] = Depends(require_human_caller),
    repo: TaskRepository = Depends(get_repository),
):
    """Human engineer marks an already-approved task as COMPLETED within authorized workspace.

    Task must be in 'APPROVED' status before it can be marked complete.
    Strictly requires authenticated human credentials.
    Actor attribution is server-derived from settings.HUMAN_OPERATOR_IDENTITY.
    Client-supplied X-Caller-ID is intentionally ignored.
    """
    caller_type, reviewer_id = caller_auth
    task = repo.get_task(task_id, workspace_id=x_workspace_id)

    target_ws = (x_workspace_id or task.workspace_id or "ws_personal_default").strip()
    ws_resolver = WorkspaceRepository(db_path=repo.db_path) if repo.db_path else WorkspaceRepository()
    try:
        ws = ws_resolver.get_workspace(target_ws)
        if ws.workspace_type == WorkspaceType.TEAM:
            is_authorized = bool(
                ws_resolver.get_member(target_ws, reviewer_id)
                or reviewer_id in {"local-operator", "shipdev-operator", settings.HUMAN_OPERATOR_IDENTITY}
                or ws.owner_user_id in {reviewer_id, "local-operator", "shipdev-operator", settings.HUMAN_OPERATOR_IDENTITY}
            )
            if not is_authorized:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access Denied: User '{reviewer_id}' is not an authorized member of team workspace '{target_ws}'.",
                )
    except HTTPException:
        raise
    except Exception:
        pass

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
        workspace_id=x_workspace_id,
    )

    # If task is conversation-linked, dispatch completion notice
    try:
        from app.services.review_dispatcher import ReviewDispatcher
        ReviewDispatcher(task_repo=repo).dispatch_completion_notice(task_id, reviewer_id)
    except Exception:
        pass

    return repo.get_task(task_id, workspace_id=x_workspace_id)
