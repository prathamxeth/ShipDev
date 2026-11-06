"""Task management REST routes."""

from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from app.api.deps import get_repository
from app.core.state_machine import TaskStatus
from app.models.task import (
    ApprovalRecordResponse,
    TaskCreate,
    TaskResponse,
    TransitionResponse,
)
from app.repositories.task_repository import TaskRepository

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate,
    repo: TaskRepository = Depends(get_repository),
):
    """Create a new bug report task (text or Wispr Flow voice transcript)."""
    return repo.create_task(payload)


@router.get("", response_model=List[TaskResponse])
async def list_tasks(
    status: Optional[TaskStatus] = Query(None, description="Filter tasks by workflow status"),
    repo: TaskRepository = Depends(get_repository),
):
    """List tasks, optionally filtered by status."""
    return repo.list_tasks(status=status)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    repo: TaskRepository = Depends(get_repository),
):
    """Get complete task details by ID."""
    return repo.get_task(task_id)


@router.get("/{task_id}/history", response_model=List[TransitionResponse])
async def get_task_history(
    task_id: str,
    repo: TaskRepository = Depends(get_repository),
):
    """Get chronological immutable state transition history for a task."""
    repo.get_task(task_id)  # Validate task exists
    return repo.get_transitions_for_task(task_id)


@router.get("/{task_id}/approvals", response_model=List[ApprovalRecordResponse])
async def get_task_approvals(
    task_id: str,
    repo: TaskRepository = Depends(get_repository),
):
    """Get human approval and rejection records for a task."""
    repo.get_task(task_id)  # Validate task exists
    return repo.get_approval_records_for_task(task_id)

