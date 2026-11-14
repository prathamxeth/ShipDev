"""Workspace identity, membership, and context data models."""

from enum import Enum
from typing import Any, Dict, List, Optional, Set
from pydantic import BaseModel, Field
from app.models.task import TaskResponse


class WorkspaceType(str, Enum):
    PERSONAL = "PERSONAL"
    TEAM = "TEAM"


class WorkspaceRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    LEAD = "lead"
    OPERATOR = "operator"
    MEMBER = "member"


class WorkspacePermission(str, Enum):
    READ = "read"
    WRITE = "write"
    EXECUTE = "execute"
    APPROVE = "approve"
    ADMIN = "admin"
    SHARE = "share"


ROLE_PERMISSIONS: dict[WorkspaceRole, Set[WorkspacePermission]] = {
    WorkspaceRole.OWNER: {
        WorkspacePermission.READ,
        WorkspacePermission.WRITE,
        WorkspacePermission.EXECUTE,
        WorkspacePermission.APPROVE,
        WorkspacePermission.ADMIN,
        WorkspacePermission.SHARE,
    },
    WorkspaceRole.ADMIN: {
        WorkspacePermission.READ,
        WorkspacePermission.WRITE,
        WorkspacePermission.EXECUTE,
        WorkspacePermission.APPROVE,
        WorkspacePermission.ADMIN,
        WorkspacePermission.SHARE,
    },
    WorkspaceRole.LEAD: {
        WorkspacePermission.READ,
        WorkspacePermission.WRITE,
        WorkspacePermission.EXECUTE,
        WorkspacePermission.APPROVE,
        WorkspacePermission.SHARE,
    },
    WorkspaceRole.OPERATOR: {
        WorkspacePermission.READ,
        WorkspacePermission.WRITE,
        WorkspacePermission.EXECUTE,
        WorkspacePermission.APPROVE,
    },
    WorkspaceRole.MEMBER: {
        WorkspacePermission.READ,
        WorkspacePermission.WRITE,
        WorkspacePermission.EXECUTE,
    },
}


class Workspace(BaseModel):
    id: str
    name: str
    workspace_type: WorkspaceType
    owner_user_id: str
    created_at: str
    updated_at: str


class WorkspaceMember(BaseModel):
    id: str
    workspace_id: str
    user_id: str
    role: WorkspaceRole
    joined_at: str


class WorkspaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    workspace_type: WorkspaceType = WorkspaceType.PERSONAL


class WorkspaceMemberAdd(BaseModel):
    user_id: str = Field(..., min_length=1)
    role: WorkspaceRole = WorkspaceRole.MEMBER


class WorkspaceContext(BaseModel):
    """Immutable server-side resolved workspace context for request authorization."""

    workspace_id: str
    workspace_type: WorkspaceType
    user_id: str
    role: WorkspaceRole
    permissions: Set[WorkspacePermission] = Field(default_factory=set)

    def has_permission(self, perm: WorkspacePermission) -> bool:
        return perm in self.permissions

    @property
    def is_personal(self) -> bool:
        return self.workspace_type == WorkspaceType.PERSONAL

    @property
    def is_team(self) -> bool:
        return self.workspace_type == WorkspaceType.TEAM

    @property
    def can_approve(self) -> bool:
        return WorkspacePermission.APPROVE in self.permissions

    @property
    def can_share(self) -> bool:
        return WorkspacePermission.SHARE in self.permissions

    @property
    def can_admin(self) -> bool:
        return WorkspacePermission.ADMIN in self.permissions


class AssistantStage(BaseModel):
    name: str
    status: str


class AssistantTestEvidence(BaseModel):
    command: str
    exit_code: int
    summary: str


class AssistantChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: Optional[List[Dict[str, str]]] = None


class AssistantChatResponse(BaseModel):
    category: str
    reply_text: str
    task: Optional[TaskResponse] = None
    improvements: Optional[List[str]] = None
    pipeline_executed: bool = False
    patch_diff: Optional[str] = None
    test_evidence: Optional[AssistantTestEvidence] = None
    needs_approval: bool = False
    stages: Optional[List[AssistantStage]] = None


