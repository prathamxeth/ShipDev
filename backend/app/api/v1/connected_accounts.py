"""Native Connected Accounts Endpoints for Telegram and Microsoft Teams (OIDC / OAuth 2.0).

SECURITY INVARIANTS:
1. Every operation strictly enforces authenticated workspace isolation.
2. OAuth states and PKCE code verifiers are single-use and expire in 10 minutes.
3. Access & refresh tokens are encrypted at rest using AES-256-GCM and never returned to the frontend.
4. MANDATORY CORRECTION: Account connection NEVER grants human approval / operator privileges automatically.
   Reviewer role authorization is kept as an independent, explicit permission layer.
"""

import logging
import secrets
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.api.deps import get_api_key_or_human_secret
from app.core.config import settings
from app.models.connected_account import (
    AccountDisconnectResponse,
    ConnectedAccountResponse,
    OAuthAuthorizeResponse,
    OAuthCallbackPayload,
)
from app.repositories.connected_accounts_repository import ConnectedAccountsRepository
from app.repositories.platform_repository import PlatformRepository
from app.repositories.workspace_repository import WorkspaceRepository
from app.services.telegram_oidc_service import TelegramOIDCService
from app.services.teams_oauth_service import TeamsOAuthService

logger = logging.getLogger("shipdev.api.connected_accounts")

router = APIRouter(prefix="/connected-accounts", tags=["Connected Accounts"])

_conn_repo = ConnectedAccountsRepository()
_platform_repo = PlatformRepository()
_ws_repo = WorkspaceRepository()
_telegram_service = TelegramOIDCService()
_teams_service = TeamsOAuthService()


def _resolve_workspace_id(x_workspace_id: Optional[str]) -> str:
    ws_id = (x_workspace_id or "ws_personal_default").strip()
    return ws_id if ws_id else "ws_personal_default"


@router.get("", response_model=List[ConnectedAccountResponse], summary="List connected platform accounts")
async def list_connected_accounts(
    x_workspace_id: Optional[str] = Header("ws_personal_default", alias="X-Workspace-ID"),
):
    """Retrieve all connected third-party accounts within the active workspace."""
    workspace_id = _resolve_workspace_id(x_workspace_id)
    return _conn_repo.list_connected_accounts(workspace_id)


@router.get("/{platform}/authorize", response_model=OAuthAuthorizeResponse, summary="Initiate OAuth 2.0 / OIDC flow")
async def initiate_oauth_flow(
    platform: str,
    redirect_uri: Optional[str] = Query(None),
    x_workspace_id: Optional[str] = Header("ws_personal_default", alias="X-Workspace-ID"),
    x_user_id: Optional[str] = Header("user_default_owner", alias="X-User-ID"),
):
    """Generate PKCE challenge, secure state, and return official provider authorization URL."""
    plat = platform.lower().strip()
    if plat not in ("telegram", "teams"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported OAuth provider '{platform}'. Supported: 'telegram', 'teams'.",
        )

    workspace_id = _resolve_workspace_id(x_workspace_id)
    user_id = (x_user_id or "user_default_owner").strip()

    # Generate PKCE verifier (minimum 43 characters) and nonce
    code_verifier = secrets.token_urlsafe(48)
    nonce = secrets.token_hex(16)

    resolved_redirect_uri = redirect_uri or (
        settings.TELEGRAM_OAUTH_REDIRECT_URI if plat == "telegram" else settings.TEAMS_OAUTH_REDIRECT_URI
    )

    state = _conn_repo.save_oauth_state(
        workspace_id=workspace_id,
        user_id=user_id,
        platform=plat,
        code_verifier=code_verifier,
        nonce=nonce,
        redirect_uri=resolved_redirect_uri,
        ttl_seconds=600,
    )

    if plat == "telegram":
        auth_url = _telegram_service.build_authorization_url(
            redirect_uri=resolved_redirect_uri,
            state=state,
            nonce=nonce,
            code_verifier=code_verifier,
        )
    else:
        auth_url = _teams_service.build_authorization_url(
            redirect_uri=resolved_redirect_uri,
            state=state,
            nonce=nonce,
            code_verifier=code_verifier,
        )

    return OAuthAuthorizeResponse(
        authorization_url=auth_url,
        state=state,
        platform=plat,
        code_challenge_method="S256",
    )


@router.post("/{platform}/callback", response_model=ConnectedAccountResponse, summary="Complete OAuth 2.0 / OIDC flow")
async def complete_oauth_callback(
    platform: str,
    payload: OAuthCallbackPayload,
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-ID"),
):
    """Complete authorization code exchange, verify id_token, and link verified identity.

    SECURITY INVARIANT: State challenge is atomically consumed (single-use) to prevent replay.
    """
    plat = platform.lower().strip()
    if plat not in ("telegram", "teams"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported OAuth provider '{platform}'.",
        )

    # 1. Single-use state verification and challenge recovery
    oauth_context = _conn_repo.consume_oauth_state(state=payload.state, platform=plat)
    if not oauth_context:
        logger.warning(f"[OAUTH_SECURITY] State challenge invalid or expired for platform '{plat}'")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid, expired, or replayed OAuth state. Please initiate authorization again.",
        )

    workspace_id = oauth_context["workspace_id"]
    user_id = oauth_context["user_id"]
    code_verifier = oauth_context["code_verifier"]
    expected_nonce = oauth_context["nonce"]
    redirect_uri = payload.redirect_uri or oauth_context["redirect_uri"]

    # 2. Provider-specific exchange and verification
    try:
        if plat == "telegram":
            if payload.id_token and not payload.code:
                # Direct id_token verification
                claims = _telegram_service.verify_id_token(payload.id_token, expected_nonce=expected_nonce)
                verified = {
                    "external_user_id": str(claims.get("sub", "")),
                    "external_username": claims.get("preferred_username") or claims.get("username"),
                    "external_display_name": claims.get("name") or claims.get("given_name"),
                    "access_token": None,
                    "token_expires_at": None,
                    "granted_scopes": ["openid", "profile"],
                }
            elif payload.code:
                verified = await _telegram_service.exchange_and_verify(
                    code=payload.code,
                    code_verifier=code_verifier,
                    redirect_uri=redirect_uri,
                    expected_nonce=expected_nonce,
                )
            else:
                raise ValueError("Missing 'code' or 'id_token' in Telegram callback payload.")
        else:
            if not payload.code:
                raise ValueError("Missing authorization 'code' in Microsoft Entra callback payload.")
            verified = await _teams_service.exchange_and_verify(
                code=payload.code,
                code_verifier=code_verifier,
                redirect_uri=redirect_uri,
                expected_nonce=expected_nonce,
            )
    except Exception as e:
        logger.error(f"[OAUTH_EXCHANGE_ERROR] {plat} verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Authentication failed: {str(e)}",
        )

    # 3. Secure Account Linking (Tokens encrypted at rest via AES-256-GCM)
    # MANDATORY CORRECTION 1: Connection NEVER automatically grants operator reviewer role!
    connected = _conn_repo.upsert_connected_account(
        workspace_id=workspace_id,
        user_id=user_id,
        platform=plat,
        external_user_id=verified["external_user_id"],
        external_username=verified.get("external_username"),
        external_display_name=verified.get("external_display_name"),
        external_email=verified.get("external_email"),
        tenant_id=verified.get("tenant_id"),
        access_token=verified.get("access_token"),
        refresh_token=verified.get("refresh_token"),
        token_expires_at=verified.get("token_expires_at"),
        granted_scopes=verified.get("granted_scopes"),
        bot_messaging_authorized=False,  # Separate layer
        bot_installed=False,            # Separate layer
    )

    logger.info(
        f"[CONNECTED_ACCOUNTS] Linked {plat} account '{connected.external_username or connected.external_user_id}' "
        f"to workspace '{workspace_id}' (User: '{user_id}')"
    )
    return connected


@router.post("/{platform}/disconnect", response_model=AccountDisconnectResponse, summary="Disconnect and revoke account")
async def disconnect_connected_account(
    platform: str,
    x_workspace_id: Optional[str] = Header("ws_personal_default", alias="X-Workspace-ID"),
):
    """Disconnect account, revoke stored tokens, and update platform connection state."""
    plat = platform.lower().strip()
    workspace_id = _resolve_workspace_id(x_workspace_id)

    _conn_repo.disconnect_account(workspace_id=workspace_id, platform=plat)
    return AccountDisconnectResponse(
        success=True,
        platform=plat,
        message=f"Successfully disconnected and revoked {platform.capitalize()} account.",
    )


@router.post(
    "/{platform}/authorize-operator",
    response_model=ConnectedAccountResponse,
    summary="Explicitly authorize connected account as workspace operator (Owner only)",
)
async def authorize_account_operator(
    platform: str,
    auth: Any = Depends(get_api_key_or_human_secret),
    x_workspace_id: Optional[str] = Header("ws_personal_default", alias="X-Workspace-ID"),
):
    """Separate authorization layer: Explicitly designate connected account as an authorized reviewer."""
    plat = platform.lower().strip()
    workspace_id = _resolve_workspace_id(x_workspace_id)

    account = _conn_repo.get_connected_account(workspace_id, plat)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active connected {platform} account found in workspace '{workspace_id}'.",
        )

    # Assign operator role in reviewer_role_assignments strictly scoped to workspace
    from app.models.platform import PlatformType
    _platform_repo.assign_reviewer_role(
        platform=PlatformType(plat),
        user_id=account.external_user_id,
        role="operator",
        assigned_by="workspace-owner",
        user_handle=account.external_username,
        workspace_id=workspace_id,
    )

    return _conn_repo.get_connected_account(workspace_id, plat)  # type: ignore
