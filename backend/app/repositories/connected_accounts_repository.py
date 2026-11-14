"""Repository for Native Connected Accounts (OIDC / OAuth 2.0).

Enforces:
1. Replay-proof single-use OAuth state verification.
2. Authenticated encryption at rest (AES-256-GCM) for third-party access and refresh tokens.
3. Strict workspace isolation: accounts are scoped strictly to (workspace_id, platform, external_user_id).
4. Mandatory Separation of Concerns: Account connection NEVER grants operator reviewer roles automatically.
"""

import json
import sqlite3
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.core.crypto import encrypt_token, decrypt_token
from app.db.session import get_connection
from app.models.connected_account import ConnectedAccountResponse


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ConnectedAccountsRepository:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    # =========================================================================
    # 1. Ephemeral OAuth Flow State & PKCE Management
    # =========================================================================

    def save_oauth_state(
        self,
        workspace_id: str,
        user_id: str,
        platform: str,
        code_verifier: str,
        nonce: str,
        redirect_uri: str,
        ttl_seconds: int = 600,
    ) -> str:
        """Store a single-use OAuth state challenge with PKCE code verifier and nonce."""
        state = uuid.uuid4().hex
        now = datetime.now(timezone.utc)
        expires_at = (now + timedelta(seconds=ttl_seconds)).isoformat()

        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    """
                    INSERT INTO oauth_flow_states (
                        state, workspace_id, user_id, platform, code_verifier, nonce, redirect_uri, created_at, expires_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        state,
                        workspace_id.strip(),
                        user_id.strip(),
                        platform.lower().strip(),
                        code_verifier,
                        nonce,
                        redirect_uri.strip(),
                        now.isoformat(),
                        expires_at,
                    ),
                )
        return state

    def consume_oauth_state(self, state: str, platform: str) -> Optional[Dict[str, Any]]:
        """Atomically validate, retrieve, and delete single-use OAuth state.

        Guarantees single-use replay protection and rejects expired states.
        """
        clean_state = state.strip()
        clean_plat = platform.lower().strip()
        now = _utc_now()

        with get_connection(self.db_path) as conn:
            with conn:
                cursor = conn.execute(
                    """
                    SELECT * FROM oauth_flow_states
                    WHERE state = ? AND platform = ?;
                    """,
                    (clean_state, clean_plat),
                )
                row = cursor.fetchone()
                if not row:
                    return None

                # Delete immediately to guarantee single-use consumption
                conn.execute("DELETE FROM oauth_flow_states WHERE state = ?;", (clean_state,))

                # Check expiration
                if row["expires_at"] < now:
                    return None

                return {
                    "state": row["state"],
                    "workspace_id": row["workspace_id"],
                    "user_id": row["user_id"],
                    "platform": row["platform"],
                    "code_verifier": row["code_verifier"],
                    "nonce": row["nonce"],
                    "redirect_uri": row["redirect_uri"],
                }

    # =========================================================================
    # 2. Account Persistence & Token Storage (AES-256-GCM Encrypted at Rest)
    # =========================================================================

    def upsert_connected_account(
        self,
        workspace_id: str,
        user_id: str,
        platform: str,
        external_user_id: str,
        external_username: Optional[str] = None,
        external_display_name: Optional[str] = None,
        external_email: Optional[str] = None,
        tenant_id: Optional[str] = None,
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
        token_expires_at: Optional[str] = None,
        granted_scopes: Optional[List[str]] = None,
        bot_messaging_authorized: bool = False,
        bot_installed: bool = False,
    ) -> ConnectedAccountResponse:
        """Persist or update connected third-party account with tokens encrypted at rest."""
        clean_ws = workspace_id.strip()
        clean_user = user_id.strip()
        clean_plat = platform.lower().strip()
        clean_ext_id = str(external_user_id).strip()
        now = _utc_now()

        enc_access = encrypt_token(access_token) if access_token else None
        enc_refresh = encrypt_token(refresh_token) if refresh_token else None
        scopes_json = json.dumps(granted_scopes or [])

        record_id = f"conn_{uuid.uuid4().hex[:12]}"

        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    """
                    INSERT INTO connected_accounts (
                        id, workspace_id, user_id, platform, external_user_id, external_username,
                        external_display_name, external_email, tenant_id, encrypted_access_token,
                        encrypted_refresh_token, token_expires_at, granted_scopes, status,
                        bot_messaging_authorized, bot_installed, connected_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
                    ON CONFLICT(workspace_id, platform, external_user_id) DO UPDATE SET
                        external_username = excluded.external_username,
                        external_display_name = excluded.external_display_name,
                        external_email = excluded.external_email,
                        tenant_id = excluded.tenant_id,
                        encrypted_access_token = COALESCE(excluded.encrypted_access_token, connected_accounts.encrypted_access_token),
                        encrypted_refresh_token = COALESCE(excluded.encrypted_refresh_token, connected_accounts.encrypted_refresh_token),
                        token_expires_at = COALESCE(excluded.token_expires_at, connected_accounts.token_expires_at),
                        granted_scopes = excluded.granted_scopes,
                        status = 'active',
                        bot_messaging_authorized = excluded.bot_messaging_authorized,
                        bot_installed = excluded.bot_installed,
                        updated_at = excluded.updated_at;
                    """,
                    (
                        record_id,
                        clean_ws,
                        clean_user,
                        clean_plat,
                        clean_ext_id,
                        external_username,
                        external_display_name,
                        external_email,
                        tenant_id,
                        enc_access,
                        enc_refresh,
                        token_expires_at,
                        scopes_json,
                        1 if bot_messaging_authorized else 0,
                        1 if bot_installed else 0,
                        now,
                        now,
                    ),
                )

                # Keep platform_connections summary table synchronized
                display_handle = external_username or external_display_name or external_user_id
                conn.execute(
                    """
                    INSERT INTO platform_connections (
                        id, workspace_id, platform, connected, account_name, target_name, connected_at, updated_at
                    ) VALUES (?, ?, ?, 1, ?, 'Connected Account', ?, ?)
                    ON CONFLICT(workspace_id, platform) DO UPDATE SET
                        connected = 1,
                        account_name = excluded.account_name,
                        target_name = 'Connected Account',
                        connected_at = excluded.connected_at,
                        updated_at = excluded.updated_at;
                    """,
                    (f"plat_conn_{uuid.uuid4().hex[:12]}", clean_ws, clean_plat, display_handle, now, now),
                )

        return self.get_connected_account(clean_ws, clean_plat, clean_ext_id)  # type: ignore

    def get_connected_account(
        self, workspace_id: str, platform: str, external_user_id: Optional[str] = None
    ) -> Optional[ConnectedAccountResponse]:
        """Fetch sanitized connected account for a workspace."""
        clean_ws = workspace_id.strip()
        clean_plat = platform.lower().strip()

        with get_connection(self.db_path) as conn:
            if external_user_id:
                row = conn.execute(
                    """
                    SELECT * FROM connected_accounts
                    WHERE workspace_id = ? AND platform = ? AND external_user_id = ? AND status = 'active';
                    """,
                    (clean_ws, clean_plat, str(external_user_id).strip()),
                ).fetchone()
            else:
                row = conn.execute(
                    """
                    SELECT * FROM connected_accounts
                    WHERE workspace_id = ? AND platform = ? AND status = 'active'
                    ORDER BY updated_at DESC LIMIT 1;
                    """,
                    (clean_ws, clean_plat),
                ).fetchone()

            if not row:
                return None

            # Check if this external user has an authorized reviewer role in this workspace
            role_row = conn.execute(
                """
                SELECT id FROM reviewer_role_assignments
                WHERE platform = ? AND user_id = ? AND (workspace_id = ? OR workspace_id IN ('*', 'all', 'both'))
                LIMIT 1;
                """,
                (clean_plat, row["external_user_id"], clean_ws),
            ).fetchone()

            scopes: List[str] = []
            try:
                scopes = json.loads(row["granted_scopes"] or "[]")
            except Exception:
                pass

            return ConnectedAccountResponse(
                id=row["id"],
                workspace_id=row["workspace_id"],
                user_id=row["user_id"],
                platform=row["platform"],
                external_user_id=row["external_user_id"],
                external_username=row["external_username"],
                external_display_name=row["external_display_name"],
                external_email=row["external_email"],
                tenant_id=row["tenant_id"],
                granted_scopes=scopes,
                status=row["status"],
                bot_messaging_authorized=bool(row["bot_messaging_authorized"]),
                bot_installed=bool(row["bot_installed"]),
                reviewer_role_authorized=bool(role_row),
                connected_at=row["connected_at"],
                updated_at=row["updated_at"],
            )

    def list_connected_accounts(self, workspace_id: str) -> List[ConnectedAccountResponse]:
        """List all connected accounts within the authorized workspace."""
        clean_ws = workspace_id.strip()
        results: List[ConnectedAccountResponse] = []

        with get_connection(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT * FROM connected_accounts
                WHERE workspace_id = ?
                ORDER BY platform ASC, connected_at DESC;
                """,
                (clean_ws,),
            ).fetchall()

            for row in rows:
                role_row = conn.execute(
                    """
                    SELECT id FROM reviewer_role_assignments
                    WHERE platform = ? AND user_id = ? AND (workspace_id = ? OR workspace_id IN ('*', 'all', 'both'))
                    LIMIT 1;
                    """,
                    (row["platform"], row["external_user_id"], clean_ws),
                ).fetchone()

                scopes: List[str] = []
                try:
                    scopes = json.loads(row["granted_scopes"] or "[]")
                except Exception:
                    pass

                results.append(
                    ConnectedAccountResponse(
                        id=row["id"],
                        workspace_id=row["workspace_id"],
                        user_id=row["user_id"],
                        platform=row["platform"],
                        external_user_id=row["external_user_id"],
                        external_username=row["external_username"],
                        external_display_name=row["external_display_name"],
                        external_email=row["external_email"],
                        tenant_id=row["tenant_id"],
                        granted_scopes=scopes,
                        status=row["status"],
                        bot_messaging_authorized=bool(row["bot_messaging_authorized"]),
                        bot_installed=bool(row["bot_installed"]),
                        reviewer_role_authorized=bool(role_row),
                        connected_at=row["connected_at"],
                        updated_at=row["updated_at"],
                    )
                )

        return results

    def disconnect_account(self, workspace_id: str, platform: str) -> bool:
        """Mark account as revoked, purge encrypted tokens, and update connection status."""
        clean_ws = workspace_id.strip()
        clean_plat = platform.lower().strip()
        now = _utc_now()

        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    """
                    UPDATE connected_accounts
                    SET status = 'revoked',
                        encrypted_access_token = NULL,
                        encrypted_refresh_token = NULL,
                        updated_at = ?
                    WHERE workspace_id = ? AND platform = ?;
                    """,
                    (now, clean_ws, clean_plat),
                )
                conn.execute(
                    """
                    UPDATE platform_connections
                    SET connected = 0,
                        updated_at = ?
                    WHERE workspace_id = ? AND platform = ?;
                    """,
                    (now, clean_ws, clean_plat),
                )
        return True

    def get_decrypted_tokens(
        self, workspace_id: str, platform: str
    ) -> Optional[Tuple[Optional[str], Optional[str]]]:
        """Server-side internal helper to retrieve and decrypt access/refresh tokens.

        SECURITY INVARIANT: Never call this from user-facing serialization endpoints.
        """
        clean_ws = workspace_id.strip()
        clean_plat = platform.lower().strip()

        with get_connection(self.db_path) as conn:
            row = conn.execute(
                """
                SELECT encrypted_access_token, encrypted_refresh_token
                FROM connected_accounts
                WHERE workspace_id = ? AND platform = ? AND status = 'active';
                """,
                (clean_ws, clean_plat),
            ).fetchone()

            if not row:
                return None

            access = decrypt_token(row["encrypted_access_token"]) if row["encrypted_access_token"] else None
            refresh = decrypt_token(row["encrypted_refresh_token"]) if row["encrypted_refresh_token"] else None
            return (access, refresh)
