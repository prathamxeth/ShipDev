"""Pydantic models for universal platform integration, chat events, and correlation."""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class PlatformType(str, Enum):
    SLACK = "slack"
    TEAMS = "teams"
    DISCORD = "discord"
    TELEGRAM = "telegram"


class MentionType(str, Enum):
    DIRECT_MESSAGE = "direct_message"
    MENTION = "mention"
    COMMAND = "command"
    ACTION = "action"


class TaskCategory(str, Enum):
    ENGINEERING = "engineering"
    RESEARCH = "research"
    PLANNING = "planning"
    WRITING = "writing"
    ANALYSIS = "analysis"


class ReviewDecision(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"
    REVISION_REQUESTED = "revision_requested"


class ChatEvent(BaseModel):
    """Normalized incoming interaction from any supported chat platform."""
    event_id: str
    platform: PlatformType
    conversation_id: str
    thread_id: Optional[str] = None
    user_id: str
    user_display_name: Optional[str] = None
    user_handle: Optional[str] = None
    message_text: str = ""
    mention_type: MentionType = MentionType.MENTION
    action_id: Optional[str] = None
    action_value: Optional[str] = None
    raw_payload: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class OutboundMessage(BaseModel):
    """Normalized message to be delivered back to the originating chat platform."""
    platform: PlatformType
    conversation_id: str
    thread_id: Optional[str] = None
    text: str
    blocks: Optional[List[Dict[str, Any]]] = None
    buttons: Optional[List[Dict[str, str]]] = None
    deliverable_url: Optional[str] = None
    task_id: Optional[str] = None


class DeliveryResult(BaseModel):
    """Result of outbound message transmission to a platform."""
    success: bool
    platform: PlatformType
    message_id: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    error: Optional[str] = None


class ReviewRequestPayload(BaseModel):
    """Payload representing a deliverable awaiting human sign-off."""
    task_id: str
    title: str
    summary: str
    category: TaskCategory
    patch_diff: Optional[str] = None
    evidence_summary: str
    status: str
    review_options: List[str] = Field(default_factory=lambda: ["Approve & Ship", "Request Changes"])


class ConversationTaskMapping(BaseModel):
    """Correlation link between an external chat thread and an internal ShipDev task."""
    id: str
    platform: PlatformType
    conversation_id: str
    thread_id: Optional[str] = None
    user_id: str
    user_display_name: Optional[str] = None
    task_id: str
    intent_category: Optional[TaskCategory] = None
    status: str
    created_at: str
    updated_at: str


class ReviewerRoleRecord(BaseModel):
    """Server-side authorized reviewer assignment."""
    id: str
    platform: PlatformType
    user_id: str
    user_handle: Optional[str] = None
    role: str  # "admin" | "lead" | "operator"
    assigned_by: str
    created_at: str


class PlatformHealth(BaseModel):
    """Health and connection status of a platform adapter."""
    platform: PlatformType
    configured: bool
    status: str  # "healthy" | "unconfigured" | "error"
    details: Dict[str, Any] = Field(default_factory=dict)
