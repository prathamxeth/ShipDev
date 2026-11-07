"""Workspace management, membership, memory, and explicit cross-workspace sharing REST routes."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import (
    get_caller_identity,
    get_repository,
    get_workspace_repository,
    resolve_workspace_context,
)
from app.core.state_machine import CallerType, TaskStatus
from app.models.task import TaskResponse
from app.models.workspace import (
    Workspace,
    WorkspaceContext,
    WorkspaceCreate,
    WorkspaceMember,
    WorkspaceMemberAdd,
    WorkspacePermission,
    WorkspaceRole,
    WorkspaceType,
)
from app.repositories.task_repository import TaskRepository
from app.repositories.workspace_repository import (
    PersonalWorkspaceViolationError,
    WorkspaceAccessDeniedError,
    WorkspaceNotFoundError,
    WorkspaceRepository,
)

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


class SharePreviewRequest(BaseModel):
    resource_type: str = Field(..., description="'task' or 'memory'")
    resource_id: str
    target_workspace_id: str


class ShareExecuteRequest(BaseModel):
    resource_type: str = Field(..., description="'task' or 'memory'")
    resource_id: str
    target_workspace_id: str
    confirmed: bool = Field(True, description="Explicit user confirmation")


class MemoryCreateRequest(BaseModel):
    key: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    category: str = Field("knowledge", max_length=50)


# =========================================================================
# 1. Workspace Identity & Switcher Listing
# =========================================================================

@router.get("", response_model=List[Workspace])
async def list_user_workspaces(
    caller_auth: tuple[CallerType, str] = Depends(get_caller_identity),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """List all workspaces the authenticated user is an authorized member or owner of."""
    caller_type, user_id = caller_auth
    return ws_repo.list_workspaces_for_user(user_id)


@router.post("", response_model=Workspace, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    payload: WorkspaceCreate,
    caller_auth: tuple[CallerType, str] = Depends(get_caller_identity),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """Create a new workspace (Team or Personal)."""
    caller_type, user_id = caller_auth
    return ws_repo.create_workspace(
        name=payload.name,
        workspace_type=payload.workspace_type,
        owner_user_id=user_id,
    )


@router.get("/{workspace_id}", response_model=Workspace)
async def get_workspace(
    workspace_id: str,
    context: WorkspaceContext = Depends(resolve_workspace_context),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """Get workspace details. Fails closed if caller is not an authorized member."""
    return ws_repo.get_workspace(workspace_id)


# =========================================================================
# 2. Workspace Membership & Team Administration
# =========================================================================

@router.get("/{workspace_id}/members", response_model=List[WorkspaceMember])
async def list_workspace_members(
    workspace_id: str,
    context: WorkspaceContext = Depends(resolve_workspace_context),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """List members of an authorized workspace."""
    return ws_repo.list_members(workspace_id)


@router.post("/{workspace_id}/members", response_model=WorkspaceMember, status_code=status.HTTP_201_CREATED)
async def add_workspace_member(
    workspace_id: str,
    payload: WorkspaceMemberAdd,
    context: WorkspaceContext = Depends(resolve_workspace_context),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """Add member to a team workspace. Personal workspaces strictly reject multi-member access."""
    if context.workspace_type == WorkspaceType.PERSONAL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Personal workspaces are strictly single-owner and cannot accept additional members.",
        )

    if not context.can_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace owners or admins can add members.",
        )

    try:
        return ws_repo.add_member(
            workspace_id=workspace_id,
            user_id=payload.user_id,
            role=payload.role,
            requester_id=context.user_id,
        )
    except PersonalWorkspaceViolationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except WorkspaceAccessDeniedError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


@router.delete("/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_workspace_member(
    workspace_id: str,
    user_id: str,
    context: WorkspaceContext = Depends(resolve_workspace_context),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """Remove member from a team workspace."""
    if not context.can_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace owners or admins can remove members.",
        )
    try:
        ws_repo.remove_member(workspace_id, user_id, requester_id=context.user_id)
        return None
    except WorkspaceAccessDeniedError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))


# =========================================================================
# 3. Isolated Memory Management
# =========================================================================

@router.get("/{workspace_id}/memory", response_model=List[Dict[str, Any]])
async def list_workspace_memory(
    workspace_id: str,
    category: Optional[str] = Query(None),
    context: WorkspaceContext = Depends(resolve_workspace_context),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """List memory items strictly isolated within the authorized workspace."""
    return ws_repo.list_memory(workspace_id=workspace_id, category=category)


@router.post("/{workspace_id}/memory", status_code=status.HTTP_201_CREATED)
async def store_workspace_memory(
    workspace_id: str,
    payload: MemoryCreateRequest,
    context: WorkspaceContext = Depends(resolve_workspace_context),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """Store an isolated memory item in the workspace."""
    mem_id = ws_repo.store_memory(
        workspace_id=workspace_id,
        key=payload.key,
        content=payload.content,
        category=payload.category,
    )
    return {"id": mem_id, "status": "stored", "workspace_id": workspace_id}


# =========================================================================
# 4. Explicit Cross-Workspace Sharing Workflow (Phase 5)
# =========================================================================

@router.post("/share/preview")
async def preview_resource_sharing(
    payload: SharePreviewRequest,
    context: WorkspaceContext = Depends(resolve_workspace_context),
    task_repo: TaskRepository = Depends(get_repository),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """Preview exactly what content will be shared to a destination team workspace.

    Security checks:
    - Verifies source resource exists in caller's active workspace.
    - Verifies caller is a valid member of destination team workspace.
    - Returns preview without modifying or syncing data.
    """
    # Verify destination workspace exists and caller is a member
    dest_ws = ws_repo.get_workspace(payload.target_workspace_id)
    dest_member = ws_repo.get_member(payload.target_workspace_id, context.user_id)
    if not dest_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access Denied: You are not an authorized member of destination workspace '{payload.target_workspace_id}'.",
        )

    if payload.resource_type == "task":
        task = task_repo.get_task(payload.resource_id, workspace_id=context.workspace_id)
        evidence = task_repo.list_evidence_for_task(payload.resource_id)
        return {
            "source_workspace_id": context.workspace_id,
            "target_workspace_id": payload.target_workspace_id,
            "target_workspace_name": dest_ws.name,
            "resource_type": "task",
            "resource_id": task.id,
            "preview_title": task.title,
            "preview_description": task.description,
            "evidence_count": len(evidence),
            "will_share": [
                "Task title and description",
                f"{len(evidence)} verified test evidence artifact(s)",
            ],
            "will_NOT_share": [
                "Personal chat history and conversations",
                "Private user preferences",
                "Unrelated personal workspace files",
            ],
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported resource type for sharing: '{payload.resource_type}'.",
        )


@router.post("/share", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def execute_resource_sharing(
    payload: ShareExecuteRequest,
    context: WorkspaceContext = Depends(resolve_workspace_context),
    task_repo: TaskRepository = Depends(get_repository),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """Execute an explicit, authorized, user-initiated cross-workspace resource share.

    Workflow:
    1. User confirms sharing intent.
    2. Server verifies caller has share permission in source workspace.
    3. Server verifies caller has membership in destination workspace.
    4. Server creates a decoupled, controlled shared copy in destination workspace.
    5. Server logs an immutable audit event in workspace_sharing_audit.
    """
    if not payload.confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit user confirmation (confirmed=true) is mandatory for cross-workspace transfer.",
        )

    if not context.can_share:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your current workspace role does not possess the 'share' permission.",
        )

    # Verify destination workspace membership
    dest_member = ws_repo.get_member(payload.target_workspace_id, context.user_id)
    if not dest_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access Denied: You are not an authorized member of destination workspace '{payload.target_workspace_id}'.",
        )

    if payload.resource_type == "task":
        shared_task = task_repo.share_task(
            task_id=payload.resource_id,
            source_workspace_id=context.workspace_id,
            target_workspace_id=payload.target_workspace_id,
            shared_by_user_id=context.user_id,
        )
        return shared_task
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported resource type for sharing: '{payload.resource_type}'.",
        )


@router.get("/{workspace_id}/audit", response_model=List[Dict[str, Any]])
async def get_workspace_sharing_audit(
    workspace_id: str,
    context: WorkspaceContext = Depends(resolve_workspace_context),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """Retrieve audit log of cross-workspace sharing events."""
    return ws_repo.list_sharing_audit(workspace_id)


@router.get("/{workspace_id}/companion-summary")
async def get_companion_summary(
    workspace_id: str,
    context: WorkspaceContext = Depends(resolve_workspace_context),
    task_repo: TaskRepository = Depends(get_repository),
    ws_repo: WorkspaceRepository = Depends(get_workspace_repository),
):
    """Lightweight summary endpoint for macOS & Windows Desktop Companion popover."""
    ws = ws_repo.get_workspace(workspace_id)
    tasks = task_repo.list_tasks(workspace_id=workspace_id)
    pending_approvals = [t for t in tasks if t.status == TaskStatus.AWAITING_HUMAN_APPROVAL]
    active_tasks = [t for t in tasks if t.status not in {TaskStatus.COMPLETED, TaskStatus.FAILED}]

    platforms = (
        ["discord", "telegram"]
        if ws.workspace_type == WorkspaceType.PERSONAL
        else ["slack", "teams"]
    )

    return {
        "workspace_id": ws.id,
        "workspace_name": ws.name,
        "workspace_type": ws.workspace_type.value,
        "pending_approval_count": len(pending_approvals),
        "pending_approvals": [
            {"id": t.id, "title": t.title, "reported_by": t.reported_by}
            for t in pending_approvals[:3]
        ],
        "active_task_count": len(active_tasks),
        "active_tasks": [
            {"id": t.id, "title": t.title, "status": t.status.value, "updated_at": t.updated_at}
            for t in active_tasks[:5]
        ],
        "platforms": platforms,
        "agent_status": "live",
    }

