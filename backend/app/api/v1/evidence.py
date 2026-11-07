"""Evidence recording and retrieval REST routes."""

from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from app.api.deps import get_repository, verify_agent_token
from app.models.task import EvidenceCreate, EvidenceResponse
from app.repositories.task_repository import TaskRepository

router = APIRouter(tags=["Evidence"])


@router.post(
    "/tasks/{task_id}/evidence",
    response_model=EvidenceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_evidence(
    task_id: str,
    payload: EvidenceCreate,
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    _caller_token: str = Depends(verify_agent_token),
    repo: TaskRepository = Depends(get_repository),
):
    """Attach verified reproduction, test, or verification evidence to a task.

    Requires authentic agent credentials (Bearer token or X-API-Key).
    Human-only credentials and insecure placeholders are rejected.
    """
    return repo.add_evidence(task_id, payload, workspace_id=x_workspace_id)


@router.get("/tasks/{task_id}/evidence", response_model=List[EvidenceResponse])
async def list_task_evidence(
    task_id: str,
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
    repo: TaskRepository = Depends(get_repository),
):
    """List all evidence artifacts recorded for a specific task."""
    repo.get_task(task_id, workspace_id=x_workspace_id)  # Validate task exists in workspace
    return repo.list_evidence_for_task(task_id, workspace_id=x_workspace_id)


@router.get("/evidence/{evidence_id}", response_model=EvidenceResponse)
async def get_evidence(
    evidence_id: str,
    repo: TaskRepository = Depends(get_repository),
):
    """Get a single evidence artifact by ID."""
    ev = repo.get_evidence_by_id(evidence_id)
    if not ev:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Evidence artifact '{evidence_id}' not found.",
        )
    return ev

