"""Official Telegram OpenID Connect (OIDC) Authentication Service.

Handles:
1. PKCE challenge generation (RFC 7636).
2. Telegram OIDC authorization URL construction.
3. Cryptographic id_token verification using Telegram JWKS.
4. Token exchange and identity claim extraction.
"""

import base64
import hashlib
import json
import logging
from typing import Any, Dict, Optional
import httpx
import jwt
from jwt import PyJWKClient

from app.core.config import settings

logger = logging.getLogger("shipdev.auth.telegram")

TELEGRAM_OIDC_DISCOVERY_URL = "https://oauth.telegram.org/.well-known/openid-configuration"
TELEGRAM_ISSUER = "https://oauth.telegram.org"


def generate_pkce_challenge(verifier: str) -> str:
    """Generate SHA-256 base64url-encoded PKCE challenge."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


class TelegramOIDCService:
    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        jwks_url: Optional[str] = None,
    ):
        self.client_id = client_id or settings.TELEGRAM_OIDC_CLIENT_ID
        self.client_secret = client_secret or settings.TELEGRAM_OIDC_CLIENT_SECRET
        self.jwks_url = jwks_url or "https://oauth.telegram.org/.well-known/jwks.json"

    def build_authorization_url(
        self,
        redirect_uri: str,
        state: str,
        nonce: str,
        code_verifier: str,
    ) -> str:
        """Construct the official Telegram OpenID Connect authorization URL with PKCE."""
        code_challenge = generate_pkce_challenge(code_verifier)
        client_id = self.client_id or "shipdev_bot"

        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid profile",
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        query_string = "&".join(f"{k}={httpx.URL('', params={k: v}).query.decode('utf-8')}" for k, v in params.items())
        return f"https://oauth.telegram.org/auth?{query_string}"

    async def exchange_and_verify(
        self,
        code: str,
        code_verifier: str,
        redirect_uri: str,
        expected_nonce: str,
    ) -> Dict[str, Any]:
        """Exchange authorization code for tokens and verify Telegram JWKS id_token."""
        # 1. Exchange code at Telegram token endpoint
        token_endpoint = "https://oauth.telegram.org/token"
        payload = {
            "grant_type": "authorization_code",
            "client_id": self.client_id or "",
            "client_secret": self.client_secret or "",
            "code": code,
            "code_verifier": code_verifier,
            "redirect_uri": redirect_uri,
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(token_endpoint, data=payload)
            if resp.status_code != 200:
                logger.error(f"[TELEGRAM_OIDC] Token exchange failed HTTP {resp.status_code}: {resp.text}")
                raise ValueError(f"Telegram token exchange failed: {resp.text}")
            token_data = resp.json()

        id_token = token_data.get("id_token")
        access_token = token_data.get("access_token")
        if not id_token:
            raise ValueError("Telegram token response missing id_token.")

        # 2. Cryptographically verify id_token against Telegram JWKS
        claims = self.verify_id_token(id_token, expected_nonce=expected_nonce)

        external_user_id = str(claims.get("sub", ""))
        if not external_user_id:
            raise ValueError("Telegram id_token claims missing 'sub' subject claim.")

        return {
            "external_user_id": external_user_id,
            "external_username": claims.get("preferred_username") or claims.get("username"),
            "external_display_name": claims.get("name") or claims.get("given_name"),
            "access_token": access_token,
            "token_expires_at": None,
            "granted_scopes": ["openid", "profile"],
        }

    def verify_id_token(self, id_token: str, expected_nonce: Optional[str] = None) -> Dict[str, Any]:
        """Verify Telegram id_token signature, audience, issuer, expiry, and nonce."""
        try:
            jwks_client = PyJWKClient(self.jwks_url)
            signing_key = jwks_client.get_signing_key_from_jwt(id_token)

            options = {
                "verify_exp": True,
                "verify_aud": bool(self.client_id),
                "verify_iss": True,
            }
            decoded = jwt.decode(
                id_token,
                signing_key.key,
                algorithms=["RS256", "ES256"],
                audience=self.client_id or None,
                issuer=TELEGRAM_ISSUER,
                options=options,
            )

            if expected_nonce and decoded.get("nonce") != expected_nonce:
                raise ValueError("Telegram id_token nonce does not match original request.")

            return decoded
        except Exception as e:
            logger.error(f"[TELEGRAM_OIDC] id_token verification failed: {str(e)}")
            raise ValueError(f"Invalid Telegram id_token: {str(e)}")
