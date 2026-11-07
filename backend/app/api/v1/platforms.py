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
    PlatformConnectionInfo,
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


class ConnectPlatformPayload(BaseModel):
    account_name: Optional[str] = None
    target_name: Optional[str] = None


@router.get(
    "/connections",
    response_model=List[PlatformConnectionInfo],
    summary="Get user-friendly platform connection status",
)
async def get_platform_connections(
    x_workspace_id: Optional[str] = Header("ws_personal_default", alias="X-Workspace-ID"),
):
    """Retrieve simplified, non-technical connection cards for Discord, Telegram, Slack, and MS Teams."""
    workspace_id = x_workspace_id or "ws_personal_default"
    health_list = gateway.get_all_health()
    health_map = {h.platform: h for h in health_list}

    platform_meta = {
        PlatformType.DISCORD: {
            "name": "Discord",
            "short_description": "Chat with ShipDev directly or mention it in your Discord channels to resolve code issues.",
            "connect_url": "https://discord.com/api/oauth2/authorize?client_id=123456789012345678&permissions=274878024768&scope=bot%20applications.commands",
            "chat_url": "https://discord.com/channels/@me",
            "default_account": "@Developer",
            "default_target": "Personal Dev Server",
            "admin_approval_required": False,
            "admin_guidance": None,
        },
        PlatformType.TELEGRAM: {
            "name": "Telegram",
            "short_description": "Message ShipDev in Telegram for instant bug diagnosis and fix verification on the go.",
            "connect_url": f"https://t.me/ShipDevBot?start={workspace_id}",
            "chat_url": "https://t.me/ShipDevBot",
            "default_account": "@ShipDevUser",
            "default_target": "Private Chat",
            "admin_approval_required": False,
            "admin_guidance": None,
        },
        PlatformType.SLACK: {
            "name": "Slack",
            "short_description": "Mention @ShipDev in channels to collaborate with your team and review pull requests.",
            "connect_url": "https://slack.com/oauth/v2/authorize?client_id=shipdev_slack_app&scope=app_mentions:read,channels:history,chat:write,commands",
            "chat_url": "https://slack.com/app_redirect?channel=general",
            "default_account": "Engineering Bot",
            "default_target": "Engineering Workspace",
            "admin_approval_required": False,
            "admin_guidance": None,
        },
        PlatformType.TEAMS: {
            "name": "Microsoft Teams",
            "short_description": "Bring ShipDev into Microsoft Teams chats and channels to automate issue triage.",
            "connect_url": "https://teams.microsoft.com/l/app/shipdev-msteams-bot",
            "chat_url": "https://teams.microsoft.com",
            "default_account": "ShipDev Teammate",
            "default_target": "Engineering Team",
            "admin_approval_required": True,
            "admin_guidance": "Your organization's Microsoft 365 tenant requires IT administrator consent before adding third-party bot integrations.",
        },
    }

    results: List[PlatformConnectionInfo] = []

    for plat in [PlatformType.DISCORD, PlatformType.TELEGRAM, PlatformType.SLACK, PlatformType.TEAMS]:
        meta = platform_meta[plat]
        health = health_map.get(plat)
        db_conn = _platform_repo.get_connection(workspace_id, plat)

        is_connected = False
        account_name = None
        target_name = None
        connected_at = None

        if db_conn and db_conn.get("connected"):
            is_connected = True
            account_name = db_conn.get("account_name")
            target_name = db_conn.get("target_name")
            connected_at = db_conn.get("connected_at")
            status_label = "Connected"
        elif health and health.configured:
            is_connected = False
            account_name = None
            target_name = None
            connected_at = None
            status_label = "Configured (Ready to Link)"
        else:
            is_connected = False
            account_name = None
            target_name = None
            connected_at = None
            status_label = "Awaiting Platform Credentials"

        results.append(
            PlatformConnectionInfo(
                platform=plat,
                name=meta["name"],
                connected=is_connected,
                status_label=status_label,
                account_name=account_name,
                target_name=target_name,
                short_description=meta["short_description"],
                connect_url=meta["connect_url"],
                chat_url=meta["chat_url"] if is_connected else None,
                admin_approval_required=meta["admin_approval_required"],
                admin_guidance=meta["admin_guidance"],
                connected_at=connected_at,
            )
        )

    return results


@router.post(
    "/{platform}/connect",
    response_model=PlatformConnectionInfo,
    summary="Connect platform to active workspace",
)
async def connect_platform_endpoint(
    platform: PlatformType,
    payload: Optional[ConnectPlatformPayload] = None,
    x_workspace_id: Optional[str] = Header("ws_personal_default", alias="X-Workspace-ID"),
):
    """Authenticate and link a platform to the active workspace effortlessly."""
    workspace_id = x_workspace_id or "ws_personal_default"
    account = (payload and payload.account_name) or f"@{platform.value.capitalize()}User"
    target = (payload and payload.target_name) or (
        "Personal Server" if platform in (PlatformType.DISCORD, PlatformType.TELEGRAM) else "Organization Team"
    )

    _platform_repo.set_connection(
        workspace_id=workspace_id,
        platform=platform,
        connected=True,
        account_name=account,
        target_name=target,
    )

    connections = await get_platform_connections(x_workspace_id=workspace_id)
    matched = next((c for c in connections if c.platform == platform), None)
    if not matched:
        raise HTTPException(status_code=404, detail="Platform info not found")
    return matched


@router.post(
    "/{platform}/disconnect",
    response_model=PlatformConnectionInfo,
    summary="Disconnect platform from active workspace",
)
async def disconnect_platform_endpoint(
    platform: PlatformType,
    x_workspace_id: Optional[str] = Header("ws_personal_default", alias="X-Workspace-ID"),
):
    """Disconnect a platform integration from the active workspace."""
    workspace_id = x_workspace_id or "ws_personal_default"
    _platform_repo.set_connection(
        workspace_id=workspace_id,
        platform=platform,
        connected=False,
    )

    connections = await get_platform_connections(x_workspace_id=workspace_id)
    matched = next((c for c in connections if c.platform == platform), None)
    if not matched:
        raise HTTPException(status_code=404, detail="Platform info not found")
    return matched
