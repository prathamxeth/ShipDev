"""Pydantic models for Native Connected Accounts (OIDC / OAuth 2.0)."""

from typing import List, Optional
from pydantic import BaseModel, Field


class ConnectedAccountResponse(BaseModel):
    """Safe, sanitized public representation of a connected platform account.

    SECURITY INVARIANT: Never exposes access tokens, refresh tokens, or client secrets.
    """
    id: str
    workspace_id: str
    user_id: str
    platform: str
    external_user_id: str
    external_username: Optional[str] = None
    external_display_name: Optional[str] = None
    external_email: Optional[str] = None
    tenant_id: Optional[str] = None
    granted_scopes: List[str] = Field(default_factory=list)
    status: str = "active"  # 'active', 'expired', 'revoked'
    bot_messaging_authorized: bool = False
    bot_installed: bool = False
    reviewer_role_authorized: bool = False
    connected_at: str
    updated_at: str


class OAuthAuthorizeResponse(BaseModel):
    """Response containing the official provider authorization URL."""
    authorization_url: str
    state: str
    platform: str
    code_challenge_method: str = "S256"


class OAuthCallbackPayload(BaseModel):
    """Payload received from the OAuth callback flow."""
    code: Optional[str] = None
    state: str
    id_token: Optional[str] = None
    redirect_uri: Optional[str] = None


class AccountDisconnectResponse(BaseModel):
    """Response returned upon disconnecting a third-party account."""
    success: bool
    platform: str
    message: str
