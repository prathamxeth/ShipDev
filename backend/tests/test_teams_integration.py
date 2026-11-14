"""Comprehensive test suite for Microsoft Teams integration in ShipDev:
- Webhook signature verification (Bearer and HMAC-SHA256)
- Message routing to unified Gemini assistant and Switch execution pipeline
- Interactive Adaptive Card generation with HMAC-signed approval tokens
- Operator authorization via settings, DB assignments, and /pair command
- Task state transitions (AWAITING_HUMAN_APPROVAL -> COMPLETED / FIX_PROPOSED)
- Workspace isolation (Personal vs Team workspaces)
- Replay protection, token expiration, and webhook deduplication
- Connected Apps API endpoints
"""

import hashlib
import hmac
import json
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from app.adapters.teams_adapter import TeamsAdapter
from app.core.approval_tokens import generate_approval_callback_data, verify_approval_callback_data
from app.core.config import settings
from app.core.orchestrator import UniversalOrchestrator
from app.core.platform_gateway import PlatformGateway
from app.core.state_machine import TaskStatus
from app.db.session import init_db
from app.main import app
from app.models.platform import (
    ChatEvent,
    DeliveryResult,
    MentionType,
    OutboundMessage,
    PlatformHealth,
    PlatformType,
    ReviewRequestPayload,
    TaskCategory,
)
from app.repositories.platform_repository import PlatformRepository
from app.repositories.task_repository import TaskRepository
from app.repositories.workspace_repository import WorkspaceRepository


class MockTeamsAdapter(TeamsAdapter):
    """Test double recording sent outbound messages and review cards."""

    def __init__(
        self,
        app_id: str = "mock_teams_app_id",
        app_password: str = "mock_teams_app_pw",
        webhook_secret: str = "test_teams_secret",
        incoming_webhook_url: str = "https://outlook.office.com/webhook/test",
    ):
        super().__init__(
            app_id=app_id,
            app_password=app_password,
            webhook_secret=webhook_secret,
            incoming_webhook_url=incoming_webhook_url,
        )
        self.sent_messages: list[OutboundMessage] = []
        self.sent_review_cards: list[tuple[str, ReviewRequestPayload, str]] = []

    def send_message(self, message: OutboundMessage) -> DeliveryResult:
        self.sent_messages.append(message)
        return DeliveryResult(
            success=True,
            platform=PlatformType.TEAMS,
            message_id=f"teams_msg_{len(self.sent_messages)}",
        )

    def send_review_card(
        self, conversation_id: str, payload: ReviewRequestPayload, thread_id: str = None
    ) -> DeliveryResult:
        self.sent_review_cards.append((conversation_id, payload, thread_id or ""))
        return DeliveryResult(
            success=True,
            platform=PlatformType.TEAMS,
            message_id=f"teams_card_{len(self.sent_review_cards)}",
        )


@pytest.fixture
def teams_test_env(tmp_path):
    db_file = str(tmp_path / "test_teams_integration.db")
    init_db(db_file)
    task_repo = TaskRepository(db_file)
    platform_repo = PlatformRepository(db_file)
    ws_repo = WorkspaceRepository(db_file)

    adapter = MockTeamsAdapter()
    gateway = PlatformGateway(repository=platform_repo)
    gateway.register_adapter(adapter)

    orchestrator = UniversalOrchestrator(
        gateway=gateway,
        task_repo=task_repo,
        platform_repo=platform_repo,
    )

    return {
        "db_file": db_file,
        "task_repo": task_repo,
        "platform_repo": platform_repo,
        "ws_repo": ws_repo,
        "adapter": adapter,
        "gateway": gateway,
        "orchestrator": orchestrator,
    }


def make_teams_activity(
    activity_id: str,
    text: str,
    user_id: str = "29:teams_user_123",
    user_name: str = "Alex Engineer",
    user_principal_name: str = "alex@contoso.com",
    conversation_id: str = "19:conv_team_abc@thread.tacv2",
    tenant_id: str = "tenant_xyz_789",
) -> bytes:
    """Helper to generate a Microsoft Teams Activity payload."""
    payload = {
        "type": "message",
        "id": activity_id,
        "timestamp": "2026-11-15T00:00:00.000Z",
        "text": f"<at>ShipDev</at> {text}",
        "conversation": {
            "id": conversation_id,
            "tenantId": tenant_id,
            "conversationType": "channel",
        },
        "from": {
            "id": user_id,
            "name": user_name,
            "userPrincipalName": user_principal_name,
            "aadObjectId": user_id,
        },
        "channelData": {
            "tenant": {"id": tenant_id},
        },
    }
    return json.dumps(payload).encode("utf-8")


def make_teams_action_submit(
    activity_id: str,
    action: str,
    task_id: str,
    callback_data: str,
    user_id: str = "29:teams_user_123",
    user_name: str = "Alex Engineer",
    conversation_id: str = "19:conv_team_abc@thread.tacv2",
) -> bytes:
    """Helper to generate a Teams Adaptive Card Action.Submit activity payload."""
    payload = {
        "type": "message",
        "id": activity_id,
        "timestamp": "2026-11-15T00:00:00.000Z",
        "conversation": {"id": conversation_id},
        "from": {
            "id": user_id,
            "name": user_name,
            "aadObjectId": user_id,
        },
        "value": {
            "action": action,
            "task_id": task_id,
            "callback_data": callback_data,
        },
    }
    return json.dumps(payload).encode("utf-8")


# =========================================================================
# 1. Signature Verification Tests
# =========================================================================

def test_teams_adapter_signature_verification_bearer():
    adapter = TeamsAdapter(webhook_secret="secret_12345")
    headers = {"Authorization": "Bearer secret_12345"}
    assert adapter.verify_signature(headers, b"{}") is True

    bad_headers = {"Authorization": "Bearer wrong_secret"}
    assert adapter.verify_signature(bad_headers, b"{}") is False


def test_teams_adapter_signature_verification_hmac():
    secret = "secret_12345"
    body = b'{"type": "message"}'
    sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()

    adapter = TeamsAdapter(webhook_secret=secret)
    headers = {"Authorization": f"HMAC {sig}"}
    assert adapter.verify_signature(headers, body) is True

    bad_headers = {"Authorization": "HMAC badsignature"}
    assert adapter.verify_signature(bad_headers, body) is False


def test_teams_adapter_signature_verification_missing_or_unconfigured():
    adapter = TeamsAdapter(webhook_secret="")
    assert adapter.verify_signature({"Authorization": "Bearer abc"}, b"{}") is False

    adapter_with_secret = TeamsAdapter(webhook_secret="valid_secret")
    assert adapter_with_secret.verify_signature({}, b"{}") is False


# =========================================================================
# 2. Webhook Deduplication and Idempotency
# =========================================================================

def test_teams_webhook_idempotency_and_deduplication(teams_test_env):
    gateway = teams_test_env["gateway"]
    orchestrator = teams_test_env["orchestrator"]

    body = make_teams_activity("act_dup_101", "Hello ShipDev")
    headers = {"Authorization": "Bearer test_teams_secret"}

    # First delivery
    event = gateway.process_inbound_webhook(PlatformType.TEAMS, headers, body)
    assert event is not None
    assert event.event_id == "act_dup_101"

    res = orchestrator.handle_chat_event(event)
    assert res["status"] == "assistant_reply"

    # Second delivery of duplicate activity ID
    dup_event = gateway.process_inbound_webhook(PlatformType.TEAMS, headers, body)
    assert dup_event is None  # Deduplicated and ignored


# =========================================================================
# 3. Message Routing to Gemini & Switch Execution Pipeline
# =========================================================================

def test_teams_conversational_message_routes_to_assistant(teams_test_env):
    orchestrator = teams_test_env["orchestrator"]
    adapter = teams_test_env["adapter"]

    event = ChatEvent(
        event_id="evt_conv_1",
        platform=PlatformType.TEAMS,
        conversation_id="19:conv_team_1",
        user_id="29:user_alex",
        user_display_name="Alex Engineer",
        message_text="What are the current capabilities of ShipDev?",
        mention_type=MentionType.MENTION,
        raw_payload={},
    )

    res = orchestrator.handle_chat_event(event)
    assert res["status"] == "assistant_reply"
    assert res["workspace_id"] == "ws_team_default"
    assert len(adapter.sent_messages) == 1
    assert "capabilities" in adapter.sent_messages[0].text.lower() or "shipdev" in adapter.sent_messages[0].text.lower()


def test_teams_engineering_request_triggers_switch_pipeline(teams_test_env):
    orchestrator = teams_test_env["orchestrator"]
    adapter = teams_test_env["adapter"]
    task_repo = teams_test_env["task_repo"]

    event = ChatEvent(
        event_id="evt_eng_1",
        platform=PlatformType.TEAMS,
        conversation_id="19:conv_team_1",
        user_id="29:user_alex",
        user_display_name="Alex Engineer",
        message_text="Execute the improvements: fix the reported defect and verify with test suite",
        mention_type=MentionType.MENTION,
        raw_payload={},
    )

    res = orchestrator.handle_chat_event(event)
    assert res["status"] == "assistant_reply"
    assert res["pipeline_executed"] is True
    assert res["needs_approval"] is True
    task_id = res["task_id"]
    assert task_id is not None

    # Verify task state in repository
    task = task_repo.get_task(task_id)
    assert task.status == TaskStatus.AWAITING_HUMAN_APPROVAL
    assert task.workspace_id == "ws_team_default"

    # Verify assistant reply sent to Teams
    assert len(adapter.sent_messages) >= 1
    assert "reproducible failure" in adapter.sent_messages[0].text.lower() or "patch" in adapter.sent_messages[0].text.lower()

    # Verify Adaptive Card review request dispatched to Teams
    assert len(adapter.sent_review_cards) == 1
    card_conv, card_payload, _ = adapter.sent_review_cards[0]
    assert card_conv == "19:conv_team_1"
    assert card_payload.task_id == task_id
    assert card_payload.patch_diff is not None
    assert "-" in card_payload.patch_diff and "+" in card_payload.patch_diff


# =========================================================================
# 4. Interactive Adaptive Card Approval Flow
# =========================================================================

def test_teams_adaptive_card_approval_by_authorized_operator(teams_test_env, monkeypatch):
    orchestrator = teams_test_env["orchestrator"]
    task_repo = teams_test_env["task_repo"]
    adapter = teams_test_env["adapter"]

    # Configure Teams operator via settings
    operator_id = "29:teams_lead_op"
    monkeypatch.setattr(settings, "TEAMS_OPERATOR_USER_ID", operator_id)
    monkeypatch.setattr(settings, "TEAMS_OPERATOR_WORKSPACE_ID", "ws_team_default")

    # Create task through engineering request
    req_event = ChatEvent(
        event_id="evt_req_2",
        platform=PlatformType.TEAMS,
        conversation_id="19:conv_team_1",
        user_id="29:user_alex",
        user_display_name="Alex",
        message_text="Execute the improvements",
        mention_type=MentionType.MENTION,
        raw_payload={},
    )
    res = orchestrator.handle_chat_event(req_event)
    task_id = res["task_id"]

    # Generate valid callback token for approve
    token = generate_approval_callback_data("approve", task_id)

    # Submit review action from authorized operator
    action_event = ChatEvent(
        event_id="evt_act_approve",
        platform=PlatformType.TEAMS,
        conversation_id="19:conv_team_1",
        user_id=operator_id,
        user_display_name="Lead Operator",
        message_text="Action: approve_task",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task_id,
        raw_payload={"callback_query": {"data": token}},
    )

    action_res = orchestrator.handle_chat_event(action_event)
    assert action_res["status"] == "approved"
    assert action_res["task_id"] == task_id

    # Verify task transitioned to COMPLETED
    task = task_repo.get_task(task_id)
    assert task.status == TaskStatus.COMPLETED

    # Verify confirmation sent to Teams
    sent = adapter.sent_messages[-1]
    assert "production deployment completed" in sent.text.lower() or "approved & shipped" in sent.text.lower()


def test_teams_adaptive_card_approval_rejected_for_unauthorized_user(teams_test_env, monkeypatch):
    orchestrator = teams_test_env["orchestrator"]
    task_repo = teams_test_env["task_repo"]
    adapter = teams_test_env["adapter"]

    # Configure different authorized operator
    monkeypatch.setattr(settings, "TEAMS_OPERATOR_USER_ID", "29:authorized_lead")
    monkeypatch.setattr(settings, "TEAMS_OPERATOR_WORKSPACE_ID", "ws_team_default")

    # Create task
    req_event = ChatEvent(
        event_id="evt_req_3",
        platform=PlatformType.TEAMS,
        conversation_id="19:conv_team_1",
        user_id="29:user_alex",
        message_text="Execute the improvements",
        mention_type=MentionType.MENTION,
        raw_payload={},
    )
    res = orchestrator.handle_chat_event(req_event)
    task_id = res["task_id"]

    token = generate_approval_callback_data("approve", task_id)

    # Unauthorized user attempts to approve
    unauthorized_id = "29:unauthorized_guest"
    action_event = ChatEvent(
        event_id="evt_act_unauth",
        platform=PlatformType.TEAMS,
        conversation_id="19:conv_team_1",
        user_id=unauthorized_id,
        user_display_name="Guest User",
        message_text="Action: approve_task",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task_id,
        raw_payload={"callback_query": {"data": token}},
    )

    action_res = orchestrator.handle_chat_event(action_event)
    assert action_res["status"] == "unauthorized"

    # Task remains securely at AWAITING_HUMAN_APPROVAL
    task = task_repo.get_task(task_id)
    assert task.status == TaskStatus.AWAITING_HUMAN_APPROVAL

    # Denial message mentions Microsoft Teams ID and instructions
    sent = adapter.sent_messages[-1]
    assert "permission denied" in sent.text.lower()
    assert "microsoft teams id" in sent.text.lower()
    assert unauthorized_id in sent.text


# =========================================================================
# 5. Workspace Isolation (Personal vs Team)
# =========================================================================

def test_teams_workspace_isolation_team_operator_cannot_approve_personal_task(teams_test_env, monkeypatch):
    orchestrator = teams_test_env["orchestrator"]
    task_repo = teams_test_env["task_repo"]
    platform_repo = teams_test_env["platform_repo"]
    adapter = teams_test_env["adapter"]

    # Operator only authorized for ws_team_default
    op_id = "29:team_only_operator"
    platform_repo.assign_reviewer_role(
        platform=PlatformType.TEAMS,
        user_id=op_id,
        role="operator",
        assigned_by="admin",
        workspace_id="ws_team_default",
    )

    # Bind a developer to ws_personal_default
    personal_user_id = "29:personal_user_xyz"
    platform_repo.assign_reviewer_role(
        platform=PlatformType.TEAMS,
        user_id=personal_user_id,
        role="developer",
        assigned_by="admin",
        workspace_id="ws_personal_default",
    )

    # Personal user requests engineering execution -> task created in ws_personal_default
    exec_event = ChatEvent(
        event_id="evt_iso_exec",
        platform=PlatformType.TEAMS,
        conversation_id="19:personal_conv_1",
        user_id=personal_user_id,
        user_display_name="Personal Dev",
        message_text="Execute the improvements",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={},
    )
    exec_res = orchestrator.handle_chat_event(exec_event)
    task_id = exec_res["task_id"]

    personal_task = task_repo.get_task(task_id)
    assert personal_task.workspace_id == "ws_personal_default"
    assert personal_task.status == TaskStatus.AWAITING_HUMAN_APPROVAL

    token = generate_approval_callback_data("approve", personal_task.id)

    action_event = ChatEvent(
        event_id="evt_act_cross_ws",
        platform=PlatformType.TEAMS,
        conversation_id="19:personal_conv_1",
        user_id=op_id,
        user_display_name="Team Operator",
        message_text="Action: approve_task",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=personal_task.id,
        raw_payload={"callback_query": {"data": token}},
    )

    action_res = orchestrator.handle_chat_event(action_event)
    assert action_res["status"] == "unauthorized"
    assert action_res["workspace_id"] == "ws_personal_default"

    # Task remains in AWAITING_HUMAN_APPROVAL
    reloaded = task_repo.get_task(personal_task.id)
    assert reloaded.status == TaskStatus.AWAITING_HUMAN_APPROVAL


# =========================================================================
# 6. Replay Protection & Token Expiration
# =========================================================================

def test_teams_replayed_approval_callback_rejected(teams_test_env, monkeypatch):
    orchestrator = teams_test_env["orchestrator"]
    task_repo = teams_test_env["task_repo"]
    adapter = teams_test_env["adapter"]

    op_id = "29:teams_op_replay"
    monkeypatch.setattr(settings, "TEAMS_OPERATOR_USER_ID", op_id)
    monkeypatch.setattr(settings, "TEAMS_OPERATOR_WORKSPACE_ID", "ws_team_default")

    # Create and approve task
    req_event = ChatEvent(
        event_id="evt_req_4",
        platform=PlatformType.TEAMS,
        conversation_id="19:conv_team_1",
        user_id="29:user_alex",
        message_text="Execute the improvements",
        mention_type=MentionType.MENTION,
        raw_payload={},
    )
    res = orchestrator.handle_chat_event(req_event)
    task_id = res["task_id"]

    token = generate_approval_callback_data("approve", task_id)
    action_event = ChatEvent(
        event_id="evt_act_app_1",
        platform=PlatformType.TEAMS,
        conversation_id="19:conv_team_1",
        user_id=op_id,
        user_display_name="Op",
        message_text="Action: approve_task",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task_id,
        raw_payload={"callback_query": {"data": token}},
    )

    first_res = orchestrator.handle_chat_event(action_event)
    assert first_res["status"] == "approved"

    # Replay same action
    replay_res = orchestrator.handle_chat_event(action_event)
    assert replay_res["status"] == "replay_rejected"
    assert replay_res["current_status"] == TaskStatus.COMPLETED.value


def test_teams_expired_approval_token_rejected(teams_test_env, monkeypatch):
    orchestrator = teams_test_env["orchestrator"]
    task_repo = teams_test_env["task_repo"]
    adapter = teams_test_env["adapter"]

    op_id = "29:teams_op_exp"
    monkeypatch.setattr(settings, "TEAMS_OPERATOR_USER_ID", op_id)
    monkeypatch.setattr(settings, "TEAMS_OPERATOR_WORKSPACE_ID", "ws_team_default")

    req_event = ChatEvent(
        event_id="evt_req_5",
        platform=PlatformType.TEAMS,
        conversation_id="19:conv_team_1",
        user_id="29:user_alex",
        message_text="Execute the improvements",
        mention_type=MentionType.MENTION,
        raw_payload={},
    )
    res = orchestrator.handle_chat_event(req_event)
    task_id = res["task_id"]

    # Generate token in the past (already expired)
    expired_token = generate_approval_callback_data("approve", task_id, expires_in_seconds=-10)

    action_event = ChatEvent(
        event_id="evt_act_exp",
        platform=PlatformType.TEAMS,
        conversation_id="19:conv_team_1",
        user_id=op_id,
        message_text="Action: approve_task",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task_id,
        raw_payload={"callback_query": {"data": expired_token}},
    )

    action_res = orchestrator.handle_chat_event(action_event)
    assert action_res["status"] == "expired"
    task = task_repo.get_task(task_id)
    assert task.status == TaskStatus.AWAITING_HUMAN_APPROVAL


# =========================================================================
# 7. Request Changes Revision Loop
# =========================================================================

def test_teams_request_changes_revision_loop(teams_test_env, monkeypatch):
    orchestrator = teams_test_env["orchestrator"]
    task_repo = teams_test_env["task_repo"]
    adapter = teams_test_env["adapter"]

    op_id = "29:teams_op_req_changes"
    monkeypatch.setattr(settings, "TEAMS_OPERATOR_USER_ID", op_id)
    monkeypatch.setattr(settings, "TEAMS_OPERATOR_WORKSPACE_ID", "ws_team_default")

    req_event = ChatEvent(
        event_id="evt_req_6",
        platform=PlatformType.TEAMS,
        conversation_id="19:conv_team_1",
        user_id="29:user_alex",
        message_text="Execute the improvements",
        mention_type=MentionType.MENTION,
        raw_payload={},
    )
    res = orchestrator.handle_chat_event(req_event)
    task_id = res["task_id"]

    token = generate_approval_callback_data("reject", task_id)
    action_event = ChatEvent(
        event_id="evt_act_reject",
        platform=PlatformType.TEAMS,
        conversation_id="19:conv_team_1",
        user_id=op_id,
        user_display_name="Reviewer",
        message_text="Action: reject_task",
        mention_type=MentionType.ACTION,
        action_id="reject_task",
        action_value=task_id,
        raw_payload={"callback_query": {"data": token}},
    )

    action_res = orchestrator.handle_chat_event(action_event)
    assert action_res["status"] == "revision_requested"
    assert action_res["task_id"] == task_id

    # Transitions back to FIX_PROPOSED
    task = task_repo.get_task(task_id)
    assert task.status == TaskStatus.FIX_PROPOSED


# =========================================================================
# 8. Whoami and Dynamic /pair Commands
# =========================================================================

def test_teams_whoami_identity_command(teams_test_env):
    orchestrator = teams_test_env["orchestrator"]
    adapter = teams_test_env["adapter"]

    event = ChatEvent(
        event_id="evt_whoami",
        platform=PlatformType.TEAMS,
        conversation_id="19:conv_team_1",
        user_id="29:teams_ident_123",
        user_display_name="Priya Patel",
        user_handle="priya@contoso.com",
        message_text="/whoami",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"conversation": {"tenantId": "tenant_abc_456"}},
    )

    res = orchestrator.handle_chat_event(event)
    assert res["status"] == "assistant_reply"
    sent = adapter.sent_messages[-1]
    assert "29:teams_ident_123" in sent.text
    assert "Priya Patel" in sent.text
    assert "priya@contoso.com" in sent.text
    assert "tenant_abc_456" in sent.text
    assert "TEAMS_OPERATOR_USER_ID=29:teams_ident_123" in sent.text


def test_teams_pair_command_authorizes_operator(teams_test_env, monkeypatch):
    orchestrator = teams_test_env["orchestrator"]
    platform_repo = teams_test_env["platform_repo"]
    adapter = teams_test_env["adapter"]

    secret = "secret_valid_pair_teams_key_2026"
    monkeypatch.setattr(settings, "HUMAN_APPROVAL_SECRET", secret)

    user_id = "29:dynamic_teams_op"
    assert not platform_repo.is_authorized_reviewer(PlatformType.TEAMS, user_id, "ws_team_default")

    pair_event = ChatEvent(
        event_id="evt_pair_teams",
        platform=PlatformType.TEAMS,
        conversation_id="19:conv_team_1",
        user_id=user_id,
        user_display_name="Dynamic OP",
        user_handle="dynamic_op@teams.local",
        message_text=f"/pair {secret}",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={},
    )

    res = orchestrator.handle_chat_event(pair_event)
    assert res["status"] == "paired"
    assert res["workspace_id"] == "ws_team_default"

    # Now authorized!
    assert platform_repo.is_authorized_reviewer(PlatformType.TEAMS, user_id, "ws_team_default")
    sent = adapter.sent_messages[-1]
    assert "Account Successfully Authorized as Workspace Operator" in sent.text

    # Connected account is persisted and synchronized
    account = orchestrator.conn_repo.get_connected_account("ws_team_default", "teams")
    assert account is not None
    assert account.external_user_id == user_id
    assert account.reviewer_role_authorized is True


# =========================================================================
# 9. Teams Webhook HTTP Endpoints & Connected Apps Integration
# =========================================================================

def test_teams_webhook_endpoint_full_flow(monkeypatch, tmp_path):
    db_file = str(tmp_path / "test_teams_endpoint.db")
    init_db(db_file)

    secret = "test_teams_secret_token"
    monkeypatch.setattr(settings, "TEAMS_WEBHOOK_SECRET", secret)
    monkeypatch.setattr(settings, "TEAMS_OPERATOR_USER_ID", "29:http_teams_lead")
    monkeypatch.setattr(settings, "TEAMS_OPERATOR_WORKSPACE_ID", "ws_team_default")

    from app.api.v1 import platforms as platforms_module
    from app.repositories.task_repository import TaskRepository
    from app.repositories.platform_repository import PlatformRepository

    t_repo = TaskRepository(db_file)
    p_repo = PlatformRepository(db_file)
    adapter = MockTeamsAdapter(webhook_secret=secret)

    gw = PlatformGateway(repository=p_repo)
    gw.register_adapter(adapter)
    orch = UniversalOrchestrator(gateway=gw, task_repo=t_repo, platform_repo=p_repo)

    monkeypatch.setattr(platforms_module, "_platform_repo", p_repo)
    monkeypatch.setattr(platforms_module, "gateway", gw)
    monkeypatch.setattr(platforms_module, "orchestrator", orch)

    client = TestClient(app)

    # 1. Incoming conversational activity
    body = make_teams_activity("act_http_1", "What can ShipDev do for our team?")
    headers = {"Authorization": f"Bearer {secret}"}

    resp = client.post("/api/v1/platforms/teams/webhook", headers=headers, content=body)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "accepted"
    assert data["orchestration"]["status"] == "assistant_reply"


def test_teams_connected_apps_api_lifecycle(monkeypatch, tmp_path):
    db_file = str(tmp_path / "test_teams_connected_apps.db")
    init_db(db_file)

    from app.api.v1 import platforms as platforms_module
    from app.repositories.platform_repository import PlatformRepository

    p_repo = PlatformRepository(db_file)
    monkeypatch.setattr(platforms_module, "_platform_repo", p_repo)

    client = TestClient(app)

    # 1. Connect Teams with designated operator
    conn_resp = client.post(
        "/api/v1/platforms/teams/connect",
        headers={"X-Workspace-ID": "ws_team_default"},
        json={
            "account_name": "ShipDev Bot",
            "target_name": "Core Infrastructure Team",
            "operator_user_id": "29:teams_assigned_admin",
        },
    )
    assert conn_resp.status_code == 200
    conn_data = conn_resp.json()
    assert conn_data["connected"] is True
    assert conn_data["platform"] == "teams"
    assert conn_data["target_name"] == "Core Infrastructure Team"

    # Verify role assigned in database
    assert p_repo.is_authorized_reviewer(PlatformType.TEAMS, "29:teams_assigned_admin", "ws_team_default")

    # 2. Get connection status
    list_resp = client.get("/api/v1/platforms/connections", headers={"X-Workspace-ID": "ws_team_default"})
    assert list_resp.status_code == 200
    teams_info = next(c for c in list_resp.json() if c["platform"] == "teams")
    assert teams_info["connected"] is True
    assert teams_info["status_label"] == "Connected"

    # 3. Disconnect Teams
    disc_resp = client.post("/api/v1/platforms/teams/disconnect", headers={"X-Workspace-ID": "ws_team_default"})
    assert disc_resp.status_code == 200
    assert disc_resp.json()["connected"] is False
