"""Comprehensive test suite for Native Connected Accounts:
- PKCE generation and single-use state consumption (replay protection)
- AES-256-GCM authenticated encryption at rest for tokens
- Telegram OIDC authorization and identity linking
- Microsoft Entra OAuth 2.0 PKCE flow and tenant linking
- Mandatory separation of concerns: connection NEVER automatically grants operator privileges
- Explicit workspace owner operator authorization
- Workspace isolation and cross-workspace access prevention
- Disconnect and token purge
- Webhook workspace routing from connected accounts
"""

import json
import pytest
import time
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.crypto import encrypt_token, decrypt_token
from app.db.session import init_db
from app.main import app
from app.models.platform import PlatformType
from app.repositories.connected_accounts_repository import ConnectedAccountsRepository
from app.repositories.platform_repository import PlatformRepository
from app.repositories.task_repository import TaskRepository
from app.core.orchestrator import UniversalOrchestrator
from app.models.platform import ChatEvent, MentionType


@pytest.fixture
def conn_test_env(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test_conn_accounts.db")
    init_db(db_file)
    conn_repo = ConnectedAccountsRepository(db_file)
    platform_repo = PlatformRepository(db_file)
    task_repo = TaskRepository(db_file)

    monkeypatch.setattr("app.api.v1.connected_accounts._conn_repo", conn_repo)
    monkeypatch.setattr("app.api.v1.connected_accounts._platform_repo", platform_repo)

    client = TestClient(app)

    return {
        "db_file": db_file,
        "conn_repo": conn_repo,
        "platform_repo": platform_repo,
        "task_repo": task_repo,
        "client": client,
    }


# =========================================================================
# 1. AES-256-GCM Authenticated Encryption at Rest
# =========================================================================

def test_token_authenticated_encryption_at_rest_aes_256_gcm():
    raw_token = "eyJh...very_sensitive_refresh_token_12345"
    encrypted = encrypt_token(raw_token)

    assert encrypted != raw_token
    assert raw_token not in encrypted

    # Decrypt recovers original token
    decrypted = decrypt_token(encrypted)
    assert decrypted == raw_token

    # Tampered ciphertext fails closed
    tampered = encrypted[:-4] + "AAAA"
    with pytest.raises(ValueError, match="integrity check error"):
        decrypt_token(tampered)


# =========================================================================
# 2. Ephemeral OAuth Flow State & PKCE Single-Use Protection
# =========================================================================

def test_oauth_state_pkce_generation_and_single_use_consumption(conn_test_env):
    conn_repo = conn_test_env["conn_repo"]

    state = conn_repo.save_oauth_state(
        workspace_id="ws_personal_default",
        user_id="user_123",
        platform="telegram",
        code_verifier="my_secret_code_verifier_1234567890_abcdef",
        nonce="random_nonce_999",
        redirect_uri="http://localhost:3000/auth/callback/telegram",
        ttl_seconds=600,
    )

    # 1. First consumption succeeds
    context = conn_repo.consume_oauth_state(state=state, platform="telegram")
    assert context is not None
    assert context["workspace_id"] == "ws_personal_default"
    assert context["code_verifier"] == "my_secret_code_verifier_1234567890_abcdef"
    assert context["nonce"] == "random_nonce_999"

    # 2. Replay attempt immediately rejected (Single-Use Invariant)
    replay = conn_repo.consume_oauth_state(state=state, platform="telegram")
    assert replay is None


def test_oauth_state_expired_rejected(conn_test_env):
    conn_repo = conn_test_env["conn_repo"]

    state = conn_repo.save_oauth_state(
        workspace_id="ws_personal_default",
        user_id="user_123",
        platform="telegram",
        code_verifier="code_verifier_123",
        nonce="nonce_123",
        redirect_uri="http://localhost:3000/auth/callback/telegram",
        ttl_seconds=-10,  # Already expired in the past
    )

    expired = conn_repo.consume_oauth_state(state=state, platform="telegram")
    assert expired is None


# =========================================================================
# 3. Telegram OIDC Flow & Account Linking
# =========================================================================

def test_telegram_authorize_and_callback_flow(conn_test_env, monkeypatch):
    client = conn_test_env["client"]
    conn_repo = conn_test_env["conn_repo"]
    platform_repo = conn_test_env["platform_repo"]

    # 1. Initiate OAuth
    auth_resp = client.get(
        "/api/v1/connected-accounts/telegram/authorize",
        headers={"X-Workspace-ID": "ws_personal_default", "X-User-ID": "user_dev"},
    )
    assert auth_resp.status_code == 200
    data = auth_resp.json()
    assert "https://oauth.telegram.org/auth?" in data["authorization_url"]
    assert "code_challenge=" in data["authorization_url"]
    state = data["state"]

    # 2. Mock Telegram token exchange / id_token verification
    fake_verified_claims = {
        "sub": "789101112",
        "username": "alex_telegram",
        "name": "Alex Engineer",
    }

    with patch("app.api.v1.connected_accounts._telegram_service.exchange_and_verify", new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = {
            "external_user_id": fake_verified_claims["sub"],
            "external_username": fake_verified_claims["username"],
            "external_display_name": fake_verified_claims["name"],
            "access_token": "tg_access_token_secret_999",
            "token_expires_at": None,
            "granted_scopes": ["openid", "profile"],
        }

        cb_resp = client.post(
            "/api/v1/connected-accounts/telegram/callback",
            headers={"X-Workspace-ID": "ws_personal_default"},
            json={
                "code": "tg_auth_code_123",
                "state": state,
                "redirect_uri": "http://localhost:3000/auth/callback/telegram",
            },
        )
        assert cb_resp.status_code == 200
        account = cb_resp.json()
        assert account["platform"] == "telegram"
        assert account["external_user_id"] == "789101112"
        assert account["external_username"] == "alex_telegram"
        assert account["status"] == "active"

        # MANDATORY CORRECTION 1: Account connection does NOT grant reviewer role automatically
        assert account["reviewer_role_authorized"] is False
        assert not platform_repo.is_authorized_reviewer(PlatformType.TELEGRAM, "789101112", "ws_personal_default")

        # Tokens are never exposed in response
        assert "encrypted_access_token" not in account
        assert "access_token" not in account


# =========================================================================
# 4. Microsoft Entra ID Flow & Account Linking
# =========================================================================

def test_teams_authorize_and_callback_flow(conn_test_env):
    client = conn_test_env["client"]
    platform_repo = conn_test_env["platform_repo"]

    # 1. Initiate OAuth
    auth_resp = client.get(
        "/api/v1/connected-accounts/teams/authorize",
        headers={"X-Workspace-ID": "ws_team_default", "X-User-ID": "user_lead"},
    )
    assert auth_resp.status_code == 200
    data = auth_resp.json()
    assert "login.microsoftonline.com" in data["authorization_url"]
    assert "code_challenge=" in data["authorization_url"]
    state = data["state"]

    # 2. Mock Microsoft exchange and Graph response
    with patch("app.api.v1.connected_accounts._teams_service.exchange_and_verify", new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = {
            "external_user_id": "29:teams_aad_oid_45678",
            "external_username": "priya@contoso.com",
            "external_display_name": "Priya Patel",
            "external_email": "priya@contoso.com",
            "tenant_id": "tenant_contoso_987",
            "access_token": "ms_access_token_secret_123",
            "refresh_token": "ms_refresh_token_secret_456",
            "token_expires_at": "2026-11-15T12:00:00Z",
            "granted_scopes": ["openid", "profile", "User.Read"],
        }

        cb_resp = client.post(
            "/api/v1/connected-accounts/teams/callback",
            headers={"X-Workspace-ID": "ws_team_default"},
            json={
                "code": "ms_auth_code_xyz",
                "state": state,
                "redirect_uri": "http://localhost:3000/auth/callback/teams",
            },
        )
        assert cb_resp.status_code == 200
        account = cb_resp.json()
        assert account["platform"] == "teams"
        assert account["external_user_id"] == "29:teams_aad_oid_45678"
        assert account["external_username"] == "priya@contoso.com"
        assert account["tenant_id"] == "tenant_contoso_987"
        assert account["status"] == "active"

        # MANDATORY CORRECTION 1: Connection does NOT grant reviewer role automatically
        assert account["reviewer_role_authorized"] is False
        assert not platform_repo.is_authorized_reviewer(PlatformType.TEAMS, "29:teams_aad_oid_45678", "ws_team_default")


# =========================================================================
# 5. Explicit Workspace-Owner Operator Authorization
# =========================================================================

def test_explicit_operator_authorization_separate_layer(conn_test_env, monkeypatch):
    client = conn_test_env["client"]
    conn_repo = conn_test_env["conn_repo"]
    platform_repo = conn_test_env["platform_repo"]

    secret = "test-human-approval-secret-key-12345"
    monkeypatch.setattr(settings, "HUMAN_APPROVAL_SECRET", secret)

    # Pre-link Telegram account
    conn_repo.upsert_connected_account(
        workspace_id="ws_personal_default",
        user_id="user_owner",
        platform="telegram",
        external_user_id="998877",
        external_username="lead_operator_tg",
    )

    # Initial state: not authorized as reviewer
    acc = conn_repo.get_connected_account("ws_personal_default", "telegram")
    assert acc.reviewer_role_authorized is False
    assert not platform_repo.is_authorized_reviewer(PlatformType.TELEGRAM, "998877", "ws_personal_default")

    # Explicit authorization via separate API layer
    auth_resp = client.post(
        "/api/v1/connected-accounts/telegram/authorize-operator",
        headers={"X-Workspace-ID": "ws_personal_default", "Authorization": f"Bearer {secret}"},
    )
    assert auth_resp.status_code == 200
    updated_acc = auth_resp.json()
    assert updated_acc["reviewer_role_authorized"] is True

    # Now authorized in reviewer role repository
    assert platform_repo.is_authorized_reviewer(PlatformType.TELEGRAM, "998877", "ws_personal_default")


# =========================================================================
# 6. Workspace Isolation (Personal vs Team)
# =========================================================================

def test_connected_account_workspace_isolation(conn_test_env):
    client = conn_test_env["client"]
    conn_repo = conn_test_env["conn_repo"]

    # Link account in ws_team_default
    conn_repo.upsert_connected_account(
        workspace_id="ws_team_default",
        user_id="user_team",
        platform="teams",
        external_user_id="team_user_oid_111",
        external_username="team_user@company.com",
    )

    # Listing in ws_personal_default returns empty list
    personal_list = client.get(
        "/api/v1/connected-accounts",
        headers={"X-Workspace-ID": "ws_personal_default"},
    ).json()
    assert len(personal_list) == 0

    # Listing in ws_team_default returns the account
    team_list = client.get(
        "/api/v1/connected-accounts",
        headers={"X-Workspace-ID": "ws_team_default"},
    ).json()
    assert len(team_list) == 1
    assert team_list[0]["external_user_id"] == "team_user_oid_111"


# =========================================================================
# 7. Disconnect and Token Purge
# =========================================================================

def test_disconnect_connected_account_purges_tokens(conn_test_env):
    client = conn_test_env["client"]
    conn_repo = conn_test_env["conn_repo"]

    conn_repo.upsert_connected_account(
        workspace_id="ws_personal_default",
        user_id="user_owner",
        platform="telegram",
        external_user_id="555444",
        access_token="secret_access_token_123",
        refresh_token="secret_refresh_token_456",
    )

    tokens_before = conn_repo.get_decrypted_tokens("ws_personal_default", "telegram")
    assert tokens_before == ("secret_access_token_123", "secret_refresh_token_456")

    disc_resp = client.post(
        "/api/v1/connected-accounts/telegram/disconnect",
        headers={"X-Workspace-ID": "ws_personal_default"},
    )
    assert disc_resp.status_code == 200
    assert disc_resp.json()["success"] is True

    # Tokens purged from database
    tokens_after = conn_repo.get_decrypted_tokens("ws_personal_default", "telegram")
    assert tokens_after is None


# =========================================================================
# 8. Webhook Workspace Routing from Connected Account
# =========================================================================

def test_connected_account_routes_webhook_to_correct_workspace(conn_test_env):
    conn_repo = conn_test_env["conn_repo"]
    platform_repo = conn_test_env["platform_repo"]
    task_repo = conn_test_env["task_repo"]

    # Link Telegram user to ws_team_default explicitly
    conn_repo.upsert_connected_account(
        workspace_id="ws_team_default",
        user_id="user_member",
        platform="telegram",
        external_user_id="66778899",
        external_username="team_member_tg",
    )

    orchestrator = UniversalOrchestrator(
        task_repo=task_repo,
        platform_repo=platform_repo,
    )

    event = ChatEvent(
        event_id="evt_linked_routing",
        platform=PlatformType.TELEGRAM,
        conversation_id="conv_123",
        user_id="66778899",
        message_text="Hello",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={},
    )

    resolved_ws = orchestrator.resolve_telegram_workspace(event)
    assert resolved_ws == "ws_team_default"


# =========================================================================
# 9. Cryptographic Nonce & Cross-Workspace Hijack Prevention
# =========================================================================

def test_telegram_id_token_nonce_mismatch_rejected(conn_test_env):
    """Ensure id_token verification fails closed when cryptographic nonce does not match."""
    from app.services.telegram_oidc_service import TelegramOIDCService
    import jwt

    service = TelegramOIDCService(client_id="test_client_id")

    # Mock PyJWKClient to return a test RSA key
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()

    mock_signing_key = MagicMock()
    mock_signing_key.key = public_key

    with patch("app.services.telegram_oidc_service.PyJWKClient") as mock_jwks_cls:
        mock_jwks = MagicMock()
        mock_jwks.get_signing_key_from_jwt.return_value = mock_signing_key
        mock_jwks_cls.return_value = mock_jwks

        # Token encoded with nonce 'nonce_A'
        token_payload = {
            "iss": "https://oauth.telegram.org",
            "aud": "test_client_id",
            "sub": "12345678",
            "nonce": "nonce_attacker_substitute",
            "exp": int(time.time()) + 3600,
        }
        token = jwt.encode(token_payload, private_key, algorithm="RS256")

        # Expecting 'nonce_authentic'
        with pytest.raises(ValueError, match="nonce does not match"):
            service.verify_id_token(token, expected_nonce="nonce_authentic")


def test_cross_workspace_oauth_callback_hijack_prevented(conn_test_env):
    """Ensure callback binds account strictly to initiation workspace, ignoring forged client headers."""
    client = conn_test_env["client"]
    conn_repo = conn_test_env["conn_repo"]

    # 1. Initiate OAuth in ws_personal_default
    auth_resp = client.get(
        "/api/v1/connected-accounts/telegram/authorize",
        headers={"X-Workspace-ID": "ws_personal_default", "X-User-ID": "user_legit"},
    )
    assert auth_resp.status_code == 200
    state = auth_resp.json()["state"]

    # 2. Attacker attempts callback while sending X-Workspace-ID: ws_team_default
    with patch("app.api.v1.connected_accounts._telegram_service.exchange_and_verify", new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = {
            "external_user_id": "11223344",
            "external_username": "victim_tg",
            "external_display_name": "Victim",
            "access_token": "tg_token",
            "token_expires_at": None,
            "granted_scopes": ["openid", "profile"],
        }

        cb_resp = client.post(
            "/api/v1/connected-accounts/telegram/callback",
            headers={"X-Workspace-ID": "ws_team_default"},  # Malicious attempt to hijack to team ws
            json={
                "code": "auth_code",
                "state": state,
                "redirect_uri": "http://localhost:3000/auth/callback/telegram",
            },
        )
        assert cb_resp.status_code == 200
        account = cb_resp.json()

        # Invariant: Must be bound to ws_personal_default (from server state), NOT ws_team_default
        assert account["workspace_id"] == "ws_personal_default"

        # Verify database state
        assert conn_repo.get_connected_account("ws_personal_default", "telegram") is not None
        assert conn_repo.get_connected_account("ws_team_default", "telegram") is None


def test_unauthenticated_authorize_operator_rejected(conn_test_env):
    """Verify that calling authorize-operator without credentials returns HTTP 401."""
    client = conn_test_env["client"]
    conn_repo = conn_test_env["conn_repo"]

    conn_repo.upsert_connected_account(
        workspace_id="ws_personal_default",
        user_id="user_owner",
        platform="telegram",
        external_user_id="555444",
    )

    # Calling without Bearer token or X-API-Key
    resp = client.post(
        "/api/v1/connected-accounts/telegram/authorize-operator",
        headers={"X-Workspace-ID": "ws_personal_default"},
    )
    assert resp.status_code == 401
    assert "Authentication Required" in resp.json()["detail"]


def test_telegram_pair_info_endpoint(conn_test_env, monkeypatch):
    """Verify GET /api/v1/connected-accounts/telegram/pair-info returns deep-link and pairing command."""
    client = conn_test_env["client"]
    from app.core.config import settings

    secret = "human-gate-key-092dad4bd98666850024de1e1dc8ae95"
    monkeypatch.setattr(settings, "HUMAN_APPROVAL_SECRET", secret)

    resp = client.get(
        "/api/v1/connected-accounts/telegram/pair-info",
        headers={"X-Workspace-ID": "ws_personal_default"},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["bot_username"] == "Shipdev_bot"
    assert data["pairing_secret"] == secret
    assert data["pairing_command"] == f"/pair {secret}"
    assert f"https://t.me/Shipdev_bot?start=pair_{secret}" == data["deep_link"]
    assert data["workspace_id"] == "ws_personal_default"


