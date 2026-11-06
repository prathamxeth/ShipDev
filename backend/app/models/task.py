"""Pydantic data models for Tasks, Evidence, Transitions, and Approval records."""

from datetime import datetime, timezone
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
from app.core.state_machine import CallerType, TaskStatus


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(..., min_length=1)
    reported_by: str = Field(..., min_length=1, max_length=100)
    input_source: str = Field(default="text", max_length=50)  # "text" | "wispr_flow"
    repository_url: Optional[str] = None
    branch_name: Optional[str] = None


class TaskResponse(BaseModel):
    id: str
    title: str
    description: str
    reported_by: str
    input_source: str
    status: TaskStatus
    repository_url: Optional[str] = None
    branch_name: Optional[str] = None
    created_at: str
    updated_at: str


class EvidenceCreate(BaseModel):
    stage: str = Field(..., max_length=50)  # "reproduction" | "verification" | "test_run"
    command_executed: str = Field(..., min_length=1)
    exit_code: int
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    patch_diff: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    is_mock: bool = False


class EvidenceResponse(BaseModel):
    id: str
    task_id: str
    stage: str
    command_executed: str
    exit_code: int
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    patch_diff: Optional[str] = None
    metadata_json: Optional[str] = None
    is_mock: bool
    recorded_at: str


class TransitionRequest(BaseModel):
    target_status: TaskStatus
    actor_type: CallerType
    actor_id: str = Field(..., min_length=1)
    reason: Optional[str] = None
    evidence_id: Optional[str] = None


class TransitionResponse(BaseModel):
    id: str
    task_id: str
    from_status: TaskStatus
    to_status: TaskStatus
    actor_type: CallerType
    actor_id: str
    reason: Optional[str] = None
    evidence_id: Optional[str] = None
    created_at: str


class ApprovalRequest(BaseModel):
    reviewer_id: str = Field(..., min_length=1)
    comments: Optional[str] = None


class RejectionRequest(BaseModel):
    reviewer_id: str = Field(..., min_length=1)
    feedback: str = Field(..., min_length=1)
    return_to: TaskStatus = TaskStatus.FIX_PROPOSED


class ApprovalRecordResponse(BaseModel):
    id: str
    task_id: str
    decision: str  # "approved" | "rejected"
    reviewer_id: str
    feedback: Optional[str] = None
    decided_at: str
