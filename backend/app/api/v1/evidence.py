"""Evidence recording and retrieval REST routes."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from app.api.deps import get_repository
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
    repo: TaskRepository = Depends(get_repository),
):
    """Attach verified reproduction, test, or verification evidence to a task."""
    return repo.add_evidence(task_id, payload)


@router.get("/tasks/{task_id}/evidence", response_model=List[EvidenceResponse])
async def list_task_evidence(
    task_id: str,
    repo: TaskRepository = Depends(get_repository),
):
    """List all evidence artifacts recorded for a specific task."""
    repo.get_task(task_id)  # Validate task exists
    return repo.list_evidence_for_task(task_id)


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

