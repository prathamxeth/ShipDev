"""Microsoft Entra ID (Teams) OAuth 2.0 / OIDC Authentication Service.

Handles:
1. PKCE challenge generation (RFC 7636).
2. Entra ID v2.0 authorization URL construction.
3. Authorization code exchange for access & refresh tokens.
4. Microsoft Graph user profile retrieval and tenant extraction.
5. Token refresh lifecycle management.
"""

import base64
import hashlib
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional
import httpx
import jwt

from app.core.config import settings

logger = logging.getLogger("shipdev.auth.teams")


def generate_pkce_challenge(verifier: str) -> str:
    """Generate SHA-256 base64url-encoded PKCE challenge."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


class TeamsOAuthService:
    def __init__(
        self,
        app_id: Optional[str] = None,
        app_password: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ):
        self.client_id = app_id or settings.TEAMS_APP_ID
        self.client_secret = app_password or settings.TEAMS_APP_PASSWORD
        self.tenant_id = tenant_id or getattr(settings, "TEAMS_TENANT_ID", "common")

    @property
    def authority_url(self) -> str:
        return f"https://login.microsoftonline.com/{self.tenant_id}/oauth2/v2.0"

    def build_authorization_url(
        self,
        redirect_uri: str,
        state: str,
        nonce: str,
        code_verifier: str,
        prompt: str = "select_account",
    ) -> str:
        """Construct the official Microsoft Entra ID authorization URL with PKCE."""
        code_challenge = generate_pkce_challenge(code_verifier)
        client_id = self.client_id or "shipdev_teams_client"

        params = {
            "client_id": client_id,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "response_mode": "query",
            "scope": "openid profile offline_access User.Read",
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "prompt": prompt,
        }
        query_string = httpx.URL("", params=params).query.decode("utf-8")
        return f"{self.authority_url}/authorize?{query_string}"

    async def exchange_and_verify(
        self,
        code: str,
        code_verifier: str,
        redirect_uri: str,
        expected_nonce: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Exchange authorization code at Entra ID token endpoint and query Graph /me."""
        token_endpoint = f"{self.authority_url}/token"
        payload = {
            "client_id": self.client_id or "",
            "client_secret": self.client_secret or "",
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": code_verifier,
            "redirect_uri": redirect_uri,
            "scope": "openid profile offline_access User.Read",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(token_endpoint, data=payload)
            if resp.status_code != 200:
                logger.error(f"[TEAMS_OAUTH] Token exchange failed HTTP {resp.status_code}: {resp.text}")
                raise ValueError(f"Microsoft Entra ID token exchange failed: {resp.text}")
            token_data = resp.json()

        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        id_token = token_data.get("id_token")
        expires_in = int(token_data.get("expires_in", 3600))
        token_expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()

        if not access_token:
            raise ValueError("Microsoft Entra ID response missing access_token.")

        # Extract tenant ID and claims from unverified id_token payload or Graph
        tenant_id = None
        claims = {}
        if id_token:
            try:
                # Read unverified claims for tenant ID (oid, tid)
                claims = jwt.decode(id_token, options={"verify_signature": False})
                tenant_id = claims.get("tid")
                if expected_nonce and claims.get("nonce") != expected_nonce:
                    raise ValueError("Microsoft id_token nonce mismatch.")
            except Exception as e:
                logger.warning(f"[TEAMS_OAUTH] Warning parsing id_token claims: {e}")

        # Query Microsoft Graph /v1.0/me for verified identity
        async with httpx.AsyncClient(timeout=10.0) as client:
            graph_resp = await client.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if graph_resp.status_code != 200:
                logger.warning(f"[TEAMS_OAUTH] Graph /me returned HTTP {graph_resp.status_code}, falling back to id_token claims")
                graph_user = {}
            else:
                graph_user = graph_resp.json()

        external_user_id = graph_user.get("id") or claims.get("oid") or claims.get("sub")
        if not external_user_id:
            raise ValueError("Could not extract verified Microsoft user ID (aadObjectId).")

        username = graph_user.get("userPrincipalName") or claims.get("preferred_username") or claims.get("upn")
        display_name = graph_user.get("displayName") or claims.get("name")
        email = graph_user.get("mail") or claims.get("email") or username

        return {
            "external_user_id": str(external_user_id),
            "external_username": username,
            "external_display_name": display_name,
            "external_email": email,
            "tenant_id": tenant_id,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_expires_at": token_expires_at,
            "granted_scopes": token_data.get("scope", "openid profile User.Read").split(),
        }

    async def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        """Obtain a refreshed access token using a stored refresh token."""
        token_endpoint = f"{self.authority_url}/token"
        payload = {
            "client_id": self.client_id or "",
            "client_secret": self.client_secret or "",
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "scope": "openid profile offline_access User.Read",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(token_endpoint, data=payload)
            if resp.status_code != 200:
                raise ValueError(f"Microsoft token refresh failed: {resp.text}")
            token_data = resp.json()

        expires_in = int(token_data.get("expires_in", 3600))
        token_expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()

        return {
            "access_token": token_data["access_token"],
            "refresh_token": token_data.get("refresh_token", refresh_token),
            "token_expires_at": token_expires_at,
        }
