"""Platform Integration Gateway Endpoints for Slack, Teams, Discord, and Telegram."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel
from app.adapters.discord_adapter import DiscordAdapter
from app.adapters.slack_adapter import SlackAdapter
from app.adapters.teams_adapter import TeamsAdapter
from app.adapters.telegram_adapter import TelegramAdapter
from app.api.deps import get_api_key_or_human_secret
from app.core.platform_gateway import PlatformGateway, PlatformSecurityError
from app.models.platform import (
    ConversationTaskMapping,
    PlatformHealth,
    PlatformType,
    ReviewerRoleRecord,
)
from app.core.orchestrator import UniversalOrchestrator
from app.repositories.platform_repository import PlatformRepository

router = APIRouter(prefix="/platforms", tags=["Platforms"])

# Global Gateway instance initialized with adapters
_platform_repo = PlatformRepository()
gateway = PlatformGateway(repository=_platform_repo)
gateway.register_adapter(SlackAdapter())
gateway.register_adapter(TeamsAdapter())
gateway.register_adapter(DiscordAdapter())
gateway.register_adapter(TelegramAdapter())

orchestrator = UniversalOrchestrator(gateway=gateway, platform_repo=_platform_repo)


class RoleAssignPayload(BaseModel):
    platform: PlatformType
    user_id: str
    role: str
    user_handle: Optional[str] = None


@router.post("/{platform}/webhook", summary="Inbound platform webhook receiver")
async def handle_platform_webhook(
    platform: PlatformType,
    request: Request,
):
    """Receive and verify inbound events from Slack, Teams, Discord, or Telegram."""
    headers = dict(request.headers)
    body_bytes = await request.body()

    try:
        event = gateway.process_inbound_webhook(platform, headers, body_bytes)
    except PlatformSecurityError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )

    if not event:
        # Handled challenge or duplicate event
        return {"status": "ok", "message": "Event processed or deduplicated"}

    # 1. Handle Platform Verification Handshakes
    if event.action_id == "url_verification" and platform == PlatformType.SLACK:
        return {"challenge": event.action_value}

    if event.action_id == "discord_ping" and platform == PlatformType.DISCORD:
        return {"type": 1}  # Discord PONG response

    # 2. Dispatch to Universal Orchestrator for classification, planning, and review handling
    orchestration_result = orchestrator.handle_chat_event(event)

    return {
        "status": "accepted",
        "event_id": event.event_id,
        "platform": event.platform.value,
        "conversation_id": event.conversation_id,
        "mention_type": event.mention_type.value,
        "action_id": event.action_id,
        "orchestration": orchestration_result,
    }


@router.get("/health", response_model=List[PlatformHealth], summary="Platform adapters connectivity diagnostics")
async def get_platforms_health():
    """Retrieve configuration and health diagnostics for Slack, Teams, Discord, and Telegram."""
    return gateway.get_all_health()


@router.get("/mappings", response_model=List[ConversationTaskMapping], summary="List conversation-to-task correlations")
async def list_conversation_mappings(
    platform: Optional[PlatformType] = None,
    limit: int = 50,
):
    """Inspect active and historic conversation-linked tasks across all platforms."""
    return _platform_repo.list_mappings(platform=platform, limit=limit)


@router.get("/roles", response_model=List[ReviewerRoleRecord], summary="List authorized reviewer roles")
async def list_reviewer_roles(
    platform: Optional[PlatformType] = None,
):
    """List server-side authorized reviewer role assignments."""
    return _platform_repo.list_reviewer_roles(platform=platform)


@router.post(
    "/roles",
    response_model=ReviewerRoleRecord,
    status_code=status.HTTP_201_CREATED,
    summary="Assign authorized reviewer role",
)
async def assign_reviewer_role(
    payload: RoleAssignPayload,
    auth: Any = Depends(get_api_key_or_human_secret),
):
    """Assign an authorized reviewer role to a platform user (Requires authenticated operator/admin secret)."""
    return _platform_repo.assign_reviewer_role(
        platform=payload.platform,
        user_id=payload.user_id,
        role=payload.role,
        assigned_by="authenticated-operator",
        user_handle=payload.user_handle,
    )
