"""Comprehensive test suite for Gemini-powered Telegram conversations, Switch pipeline execution,
workspace isolation, human approval gates, and webhook idempotency.
"""

import json
import pytest
from unittest.mock import MagicMock, patch
from app.core.approval_tokens import generate_approval_callback_data, verify_approval_callback_data
from fastapi.testclient import TestClient

from app.adapters.telegram_adapter import TelegramAdapter
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
from app.services.assistant_service import run_workspace_assistant_turn


class MockTelegramAdapter(TelegramAdapter):
    """Test double recording sent outbound messages and review cards."""

    def __init__(self, bot_token: str = "mock_bot_token", webhook_secret: str = "test_tg_secret"):
        super().__init__(bot_token=bot_token, webhook_secret=webhook_secret)
        self.sent_messages: list[OutboundMessage] = []
        self.sent_review_cards: list[tuple[str, ReviewRequestPayload, str]] = []

    def send_message(self, message: OutboundMessage) -> DeliveryResult:
        self.sent_messages.append(message)
        return DeliveryResult(
            success=True,
            platform=PlatformType.TELEGRAM,
            message_id=f"tg_msg_{len(self.sent_messages)}",
        )

    def send_review_card(self, conversation_id: str, payload: ReviewRequestPayload, thread_id: str = None) -> DeliveryResult:
        self.sent_review_cards.append((conversation_id, payload, thread_id or ""))
        return DeliveryResult(
            success=True,
            platform=PlatformType.TELEGRAM,
            message_id=f"tg_card_{len(self.sent_review_cards)}",
        )


@pytest.fixture
def tg_test_env(tmp_path):
    db_file = str(tmp_path / "test_tg_gemini.db")
    init_db(db_file)
    task_repo = TaskRepository(db_file)
    platform_repo = PlatformRepository(db_file)
    ws_repo = WorkspaceRepository(db_file)

    adapter = MockTelegramAdapter()
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


def make_tg_update(update_id: int, message_text: str, user_id: str = "12345", username: str = "test_user", chat_id: str = "98765", chat_type: str = "private") -> bytes:
    payload = {
        "update_id": update_id,
        "message": {
            "message_id": update_id + 100,
            "from": {
                "id": int(user_id) if user_id.isdigit() else 12345,
                "first_name": "Test",
                "username": username,
            },
            "chat": {
                "id": int(chat_id) if chat_id.isdigit() else 98765,
                "type": chat_type,
            },
            "text": message_text,
        },
    }
    return json.dumps(payload).encode("utf-8")


def make_tg_callback(update_id: int, callback_id: str, data_str: str, user_id: str = "12345", username: str = "test_user", chat_id: str = "98765") -> bytes:
    payload = {
        "update_id": update_id,
        "callback_query": {
            "id": callback_id,
            "from": {
                "id": int(user_id) if user_id.isdigit() else 12345,
                "first_name": "Test",
                "username": username,
            },
            "message": {
                "message_id": 999,
                "chat": {
                    "id": int(chat_id) if chat_id.isdigit() else 98765,
                    "type": "private",
                },
            },
            "data": data_str,
        },
    }
    return json.dumps(payload).encode("utf-8")


# =============================================================================
# 1. Conversational Routing & Gemini Assistant Verification
# =============================================================================

def test_telegram_conversational_greeting_routing(tg_test_env):
    """Conversational greeting routes to assistant and returns natural response via Telegram."""
    orchestrator = tg_test_env["orchestrator"]
    adapter = tg_test_env["adapter"]
    platform_repo = tg_test_env["platform_repo"]

    event = ChatEvent(
        event_id="tg_upd_1",
        platform=PlatformType.TELEGRAM,
        conversation_id="98765",
        user_id="12345",
        user_handle="telegram_dev",
        message_text="hii",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )

    result = orchestrator.handle_chat_event(event)

    assert result["status"] == "assistant_reply"
    assert result["category"] == "conversation"
    assert "Hello!" in result["reply_text"]
    assert len(adapter.sent_messages) == 1
    assert "Hello!" in adapter.sent_messages[0].text
    assert adapter.sent_messages[0].conversation_id == "98765"

    # Verify context history persisted
    history = platform_repo.get_chat_history(PlatformType.TELEGRAM, "98765", "ws_personal_default")
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[0]["content"] == "hii"
    assert history[1]["role"] == "assistant"
    assert "Hello!" in history[1]["content"]


def test_telegram_capabilities_query(tg_test_env):
    """User asks capabilities on Telegram and receives comprehensive system capabilities."""
    orchestrator = tg_test_env["orchestrator"]
    adapter = tg_test_env["adapter"]

    event = ChatEvent(
        event_id="tg_upd_2",
        platform=PlatformType.TELEGRAM,
        conversation_id="98765",
        user_id="12345",
        user_handle="telegram_dev",
        message_text="what can you do?",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )

    result = orchestrator.handle_chat_event(event)
    assert result["status"] == "assistant_reply"
    assert result["category"] == "capabilities"
    assert "Project Analysis" in result["reply_text"]
    assert "Switch multi-agent pipeline" in result["reply_text"]
    assert len(adapter.sent_messages) == 1


# =============================================================================
# 2. Project Analysis (No Premature Task Creation)
# =============================================================================

def test_telegram_project_analysis_inspects_source(tg_test_env):
    """Analyze project request uncovers real calculator defect without creating premature task."""
    orchestrator = tg_test_env["orchestrator"]
    task_repo = tg_test_env["task_repo"]
    adapter = tg_test_env["adapter"]

    event = ChatEvent(
        event_id="tg_upd_3",
        platform=PlatformType.TELEGRAM,
        conversation_id="98765",
        user_id="12345",
        user_handle="telegram_dev",
        message_text="Analyze this project and identify three improvements",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )

    result = orchestrator.handle_chat_event(event)
    assert result["status"] == "assistant_reply"
    assert result["category"] == "analysis"
    assert "calculator.py:22" in result["reply_text"]
    assert "calculate_discount" in result["reply_text"]
    assert "AssertionError: assert 120.0 == 80.0" in result["reply_text"]

    # Verify no tasks created yet
    tasks = task_repo.list_tasks(workspace_id="ws_personal_default")
    assert len(tasks) == 0
    assert len(adapter.sent_messages) == 1
    assert len(adapter.sent_review_cards) == 0


# =============================================================================
# 3. Switch Pipeline Execution & Review Card Dispatch
# =============================================================================

def test_telegram_execute_improvements_runs_switch_pipeline(tg_test_env):
    """'Execute the improvements' triggers full Switch pipeline, halts at approval, and sends review card."""
    orchestrator = tg_test_env["orchestrator"]
    task_repo = tg_test_env["task_repo"]
    adapter = tg_test_env["adapter"]

    event = ChatEvent(
        event_id="tg_upd_4",
        platform=PlatformType.TELEGRAM,
        conversation_id="98765",
        user_id="12345",
        user_handle="telegram_dev",
        message_text="Execute the improvements",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )

    result = orchestrator.handle_chat_event(event)
    assert result["status"] == "assistant_reply"
    assert result["category"] == "engineering"
    assert result["pipeline_executed"] is True
    assert result["needs_approval"] is True
    assert result["task_id"] is not None

    task_id = result["task_id"]
    task = task_repo.get_task(task_id, workspace_id="ws_personal_default")
    assert task.status == TaskStatus.AWAITING_HUMAN_APPROVAL

    # Verify real Switch pipeline transitions
    transitions = task_repo.get_transitions_for_task(task_id)
    statuses = [t.to_status for t in transitions]
    assert TaskStatus.TRIAGED in statuses
    assert TaskStatus.REPRODUCING in statuses
    assert TaskStatus.REPRODUCED in statuses
    assert TaskStatus.FIX_PROPOSED in statuses
    assert TaskStatus.VERIFYING in statuses
    assert TaskStatus.AWAITING_HUMAN_APPROVAL in statuses

    # Verify evidence records
    evidence = task_repo.list_evidence_for_task(task_id, workspace_id="ws_personal_default")
    repro_ev = next(e for e in evidence if e.stage == "reproduction")
    verify_ev = next(e for e in evidence if e.stage == "verification")
    assert repro_ev.exit_code == 1
    assert verify_ev.exit_code == 0
    assert verify_ev.patch_diff is not None
    assert "-" in verify_ev.patch_diff and "+" in verify_ev.patch_diff

    # Verify both assistant response and interactive review card were sent
    assert len(adapter.sent_messages) == 1
    assert len(adapter.sent_review_cards) == 1
    card_conv_id, card_payload, _ = adapter.sent_review_cards[0]
    assert card_conv_id == "98765"
    assert card_payload.task_id == task_id
    assert card_payload.patch_diff is not None


# =============================================================================
# 4. Human Approval Security Boundary (Requirement 7)
# =============================================================================

def test_telegram_plain_text_approve_cannot_bypass_approval(tg_test_env):
    """Plain-text 'approve' message MUST NOT advance task status."""
    orchestrator = tg_test_env["orchestrator"]
    task_repo = tg_test_env["task_repo"]

    # First, create task awaiting approval
    exec_event = ChatEvent(
        event_id="tg_upd_5a",
        platform=PlatformType.TELEGRAM,
        conversation_id="98765",
        user_id="12345",
        message_text="Execute the improvements",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )
    exec_res = orchestrator.handle_chat_event(exec_event)
    task_id = exec_res["task_id"]

    # Now attempt to approve via plain text chat message
    approve_event = ChatEvent(
        event_id="tg_upd_5b",
        platform=PlatformType.TELEGRAM,
        conversation_id="98765",
        user_id="12345",
        message_text="approve",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )
    appr_res = orchestrator.handle_chat_event(approve_event)

    # Verify task remains strictly halted at AWAITING_HUMAN_APPROVAL
    task = task_repo.get_task(task_id, workspace_id="ws_personal_default")
    assert task.status == TaskStatus.AWAITING_HUMAN_APPROVAL
    assert "Security Gate Protected" in appr_res["reply_text"]


def test_telegram_interactive_button_approval_by_authorized_operator(tg_test_env):
    """Interactive button click by authorized reviewer successfully approves and ships task."""
    orchestrator = tg_test_env["orchestrator"]
    task_repo = tg_test_env["task_repo"]
    platform_repo = tg_test_env["platform_repo"]
    adapter = tg_test_env["adapter"]

    # Assign authorized reviewer role
    platform_repo.assign_reviewer_role(
        platform=PlatformType.TELEGRAM,
        user_id="99999",
        role="operator",
        user_handle="senior_lead",
        assigned_by="system",
        workspace_id="ws_personal_default",
    )

    # Create task awaiting approval
    exec_event = ChatEvent(
        event_id="tg_upd_6a",
        platform=PlatformType.TELEGRAM,
        conversation_id="98765",
        user_id="99999",
        user_handle="senior_lead",
        message_text="Execute the improvements",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )
    exec_res = orchestrator.handle_chat_event(exec_event)
    task_id = exec_res["task_id"]

    # Operator clicks [ Approve & Ship ]
    click_event = ChatEvent(
        event_id="tg_cb_6b",
        platform=PlatformType.TELEGRAM,
        conversation_id="98765",
        user_id="99999",
        user_handle="senior_lead",
        message_text="Button click: approve",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task_id,
        raw_payload={"callback_query": {"data": f"approve:{task_id}"}},
    )
    action_res = orchestrator.handle_chat_event(click_event)

    assert action_res["status"] == "approved"
    task = task_repo.get_task(task_id, workspace_id="ws_personal_default")
    assert task.status == TaskStatus.COMPLETED

    # Verify confirmation sent to Telegram
    assert any("Task Approved & Shipped!" in m.text for m in adapter.sent_messages)


def test_telegram_interactive_button_approval_rejected_for_unauthorized_user(tg_test_env):
    """Interactive button click by unauthorized user is rejected fail-closed."""
    orchestrator = tg_test_env["orchestrator"]
    task_repo = tg_test_env["task_repo"]
    adapter = tg_test_env["adapter"]

    # Create task awaiting approval
    exec_event = ChatEvent(
        event_id="tg_upd_7a",
        platform=PlatformType.TELEGRAM,
        conversation_id="98765",
        user_id="12345",
        message_text="Execute the improvements",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )
    exec_res = orchestrator.handle_chat_event(exec_event)
    task_id = exec_res["task_id"]

    # Unauthorized user clicks button
    unauth_click = ChatEvent(
        event_id="tg_cb_7b",
        platform=PlatformType.TELEGRAM,
        conversation_id="98765",
        user_id="unauthorized_guest",
        message_text="Button click: approve",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task_id,
    )
    action_res = orchestrator.handle_chat_event(unauth_click)

    assert action_res["status"] == "unauthorized"
    task = task_repo.get_task(task_id, workspace_id="ws_personal_default")
    assert task.status == TaskStatus.AWAITING_HUMAN_APPROVAL
    assert any("Permission Denied" in m.text for m in adapter.sent_messages)


# =============================================================================
# 5. Workspace Isolation & Resolution (Requirement 3 & 4)
# =============================================================================

def test_telegram_workspace_resolution_and_context_isolation(tg_test_env):
    """Personal and Team workspaces remain strictly isolated across platform turns and history."""
    orchestrator = tg_test_env["orchestrator"]
    platform_repo = tg_test_env["platform_repo"]

    # 1. Private chat resolves to Personal workspace
    priv_event = ChatEvent(
        event_id="tg_upd_8a",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_1",
        user_id="user_priv",
        message_text="hello in private",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )
    priv_res = orchestrator.handle_chat_event(priv_event)
    assert priv_res["workspace_id"] == "ws_personal_default"

    # 2. Group chat resolves to Team workspace
    group_event = ChatEvent(
        event_id="tg_upd_8b",
        platform=PlatformType.TELEGRAM,
        conversation_id="group_conv_2",
        user_id="user_group",
        message_text="hello in group",
        mention_type=MentionType.MENTION,
        raw_payload={"message": {"chat": {"type": "group"}}},
    )
    group_res = orchestrator.handle_chat_event(group_event)
    assert group_res["workspace_id"] == "ws_team_default"

    # 3. Context history in Personal cannot leak into Team workspace
    personal_history = platform_repo.get_chat_history(
        PlatformType.TELEGRAM, "priv_conv_1", "ws_personal_default"
    )
    team_history = platform_repo.get_chat_history(
        PlatformType.TELEGRAM, "priv_conv_1", "ws_team_default"
    )
    assert len(personal_history) == 2
    assert len(team_history) == 0


# =============================================================================
# 6. Webhook Idempotency & Telegram Retries (Requirement 8)
# =============================================================================

def test_telegram_webhook_idempotency_on_retries(tg_test_env):
    """Telegram webhook retry with duplicate update_id is deduplicated with 200 OK without re-execution."""
    gateway = tg_test_env["gateway"]
    adapter = tg_test_env["adapter"]
    adapter_instance = gateway.get_adapter(PlatformType.TELEGRAM)

    body_bytes = make_tg_update(update_id=555001, message_text="hii")
    headers = {"x-telegram-bot-api-secret-token": "test_tg_secret"}

    # First delivery: processed successfully
    first_event = gateway.process_inbound_webhook(PlatformType.TELEGRAM, headers, body_bytes)
    assert first_event is not None
    assert first_event.event_id == "tg_upd_555001"

    # Second delivery (Telegram timeout retry of the exact same update_id):
    # Gateway deduplication check identifies event as already processed
    second_event = gateway.process_inbound_webhook(PlatformType.TELEGRAM, headers, body_bytes)
    assert second_event is None


# =============================================================================
# 7. Preserving Web Assistant Behavior (Requirement 10)
# =============================================================================

def test_web_assistant_turn_behavior_identical(tg_test_env):
    """Direct web assistant turn behaves identically through run_workspace_assistant_turn."""
    task_repo = tg_test_env["task_repo"]
    ws_repo = tg_test_env["ws_repo"]

    # Greet
    resp_greet = run_workspace_assistant_turn(
        message="hello",
        workspace_id="ws_personal_default",
        task_repo=task_repo,
        ws_repo=ws_repo,
    )
    assert resp_greet.category == "conversation"
    assert "Hello!" in resp_greet.reply_text

    # Analysis
    resp_analysis = run_workspace_assistant_turn(
        message="Analyze this project and identify three improvements",
        workspace_id="ws_personal_default",
        task_repo=task_repo,
        ws_repo=ws_repo,
    )
    assert resp_analysis.category == "analysis"
    assert "calculator.py:22" in resp_analysis.reply_text

    # Execute
    resp_exec = run_workspace_assistant_turn(
        message="Execute the improvements",
        workspace_id="ws_personal_default",
        task_repo=task_repo,
        ws_repo=ws_repo,
    )
    assert resp_exec.category == "engineering"
    assert resp_exec.pipeline_executed is True
    assert resp_exec.needs_approval is True
    assert resp_exec.task.status == TaskStatus.AWAITING_HUMAN_APPROVAL


# =============================================================================
# 8. Webhook FastAPI Endpoint Acceptance & Signature Tests
# =============================================================================

def test_telegram_webhook_endpoint_security_and_execution(monkeypatch, tmp_path):
    """Test full FastAPI endpoint for Telegram webhook including signature check, deduplication, and routing."""
    test_db = str(tmp_path / "test_ep.db")
    init_db(test_db)
    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite:///{test_db}")

    test_secret = "test_webhook_secret_9988"
    monkeypatch.setattr(settings, "TELEGRAM_WEBHOOK_SECRET", test_secret)

    from app.api.v1.platforms import gateway, orchestrator, _platform_repo
    _platform_repo.db_path = test_db
    orchestrator.platform_repo.db_path = test_db
    orchestrator.task_repo.db_path = test_db

    adapter = gateway.get_adapter(PlatformType.TELEGRAM)
    adapter.webhook_secret = test_secret

    with TestClient(app) as client:
        # 1. Reject missing or incorrect secret token (403 Forbidden)
        bad_headers = {"X-Telegram-Bot-Api-Secret-Token": "wrong_secret"}
        body_data = {"update_id": 999111, "message": {"text": "hii", "chat": {"id": 12345, "type": "private"}}}
        res_bad = client.post("/api/v1/platforms/telegram/webhook", headers=bad_headers, json=body_data)
        assert res_bad.status_code == 403

        # 2. Accept valid secret token and process greeting
        good_headers = {"X-Telegram-Bot-Api-Secret-Token": test_secret}
        with patch.object(adapter, "send_message", return_value=DeliveryResult(success=True, platform=PlatformType.TELEGRAM, message_id="mock_1")):
            res_good = client.post("/api/v1/platforms/telegram/webhook", headers=good_headers, json=body_data)
            assert res_good.status_code == 200
            data = res_good.json()
            assert data["status"] == "accepted"
            assert data["orchestration"]["status"] == "assistant_reply"
            assert "Hello!" in data["orchestration"]["reply_text"]

        # 3. Duplicate update_id returns 200 OK with deduplicated status
        res_dup = client.post("/api/v1/platforms/telegram/webhook", headers=good_headers, json=body_data)
        assert res_dup.status_code == 200
        dup_data = res_dup.json()
        assert dup_data["status"] == "ok"
        assert "deduplicated" in dup_data["message"]


# =============================================================================
# 9. Authoritative Bot Identity & Deep Link Tests (getMe Integration)
# =============================================================================

def test_telegram_adapter_get_me_identity_and_deep_link():
    """Verify getMe queries authoritative bot username and formats accurate deep link without hardcoding."""
    adapter = TelegramAdapter(bot_token="test_token_12345")

    # Mock Telegram getMe API response
    mock_get_me_resp = {
        "ok": True,
        "result": {
            "id": 987654321,
            "is_bot": True,
            "first_name": "ShipDev Verified Bot",
            "username": "verified_shipdev_ai_bot",
        },
    }

    with patch("urllib.request.urlopen") as mock_urlopen:
        mock_cm = MagicMock()
        mock_cm.read.return_value = json.dumps(mock_get_me_resp).encode("utf-8")
        mock_urlopen.return_value.__enter__.return_value = mock_cm

        username = adapter.get_bot_username(refresh=True)
        assert username == "verified_shipdev_ai_bot"

        # Check deep link with workspace isolation parameter
        deep_link_personal = adapter.get_deep_link(workspace_id="ws_personal_default")
        assert deep_link_personal == "https://t.me/verified_shipdev_ai_bot?start=ws_personal_default"

        deep_link_team = adapter.get_deep_link(workspace_id="ws_team_default")
        assert deep_link_team == "https://t.me/verified_shipdev_ai_bot?start=ws_team_default"

        # Check chat URL
        chat_url = adapter.get_chat_url()
        assert chat_url == "https://t.me/verified_shipdev_ai_bot"

        # Verify no hardcoded @ShipDevUser or @ShipDevBot
        assert "ShipDevUser" not in deep_link_personal
        assert "ShipDevBot" not in deep_link_personal


def test_telegram_connection_endpoints_use_authoritative_bot_identity(monkeypatch, tmp_path):
    """Verify GET /platforms/connections returns authoritative bot username and deep link."""
    test_db = str(tmp_path / "test_conn_ep.db")
    init_db(test_db)
    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite:///{test_db}")

    from app.api.v1.platforms import gateway, _platform_repo, orchestrator
    _platform_repo.db_path = test_db
    orchestrator.platform_repo.db_path = test_db
    orchestrator.task_repo.db_path = test_db

    adapter: TelegramAdapter = gateway.get_adapter(PlatformType.TELEGRAM)  # type: ignore
    adapter.set_bot_identity({
        "id": 11223344,
        "is_bot": True,
        "first_name": "ShipDev AI",
        "username": "auth_shipdev_bot",
    })

    with TestClient(app) as client:
        res = client.get("/api/v1/platforms/connections", headers={"X-Workspace-ID": "ws_personal_default"})
        assert res.status_code == 200
        conns = res.json()
        tg_conn = next(c for c in conns if c["platform"] == "telegram")

        # Verified username and deep link must match getMe output
        assert tg_conn["account_name"] == "@auth_shipdev_bot"
        assert tg_conn["connect_url"] == "https://t.me/auth_shipdev_bot?start=ws_personal_default"
        assert tg_conn["chat_url"] is None  # Not connected yet
        assert "ShipDevUser" not in tg_conn["account_name"]
        assert "ShipDevBot" not in tg_conn["connect_url"]


def test_telegram_reconnect_refreshes_bot_identity(monkeypatch, tmp_path):
    """Verify reconnecting Telegram refreshes bot identity via getMe and synchronizes database."""
    test_db = str(tmp_path / "test_reconn_ep.db")
    init_db(test_db)
    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite:///{test_db}")

    from app.api.v1.platforms import gateway, _platform_repo, orchestrator
    _platform_repo.db_path = test_db
    orchestrator.platform_repo.db_path = test_db
    orchestrator.task_repo.db_path = test_db

    adapter: TelegramAdapter = gateway.get_adapter(PlatformType.TELEGRAM)  # type: ignore
    adapter.set_bot_identity({
        "id": 11223344,
        "is_bot": True,
        "first_name": "ShipDev AI Initial",
        "username": "initial_bot_v1",
    })

    with TestClient(app) as client:
        # 1. Connect first time
        res1 = client.post("/api/v1/platforms/telegram/connect", headers={"X-Workspace-ID": "ws_personal_default"})
        assert res1.status_code == 200
        data1 = res1.json()
        assert data1["account_name"] == "@initial_bot_v1"
        assert data1["chat_url"] == "https://t.me/initial_bot_v1"
        assert data1["connect_url"] == "https://t.me/initial_bot_v1?start=ws_personal_default"

        # 2. Simulate bot username change in Telegram BotFather
        adapter.bot_token = "updated_token_456"
        mock_refreshed_resp = {
            "ok": True,
            "result": {
                "id": 11223344,
                "is_bot": True,
                "first_name": "ShipDev AI Refreshed",
                "username": "refreshed_shipdev_bot",
            },
        }

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_cm = MagicMock()
            mock_cm.read.return_value = json.dumps(mock_refreshed_resp).encode("utf-8")
            mock_urlopen.return_value.__enter__.return_value = mock_cm

            # Reconnecting must refresh the bot identity (Requirement 6)
            res2 = client.post("/api/v1/platforms/telegram/connect", headers={"X-Workspace-ID": "ws_personal_default"})
            assert res2.status_code == 200
            data2 = res2.json()

            assert data2["account_name"] == "@refreshed_shipdev_bot"
            assert data2["chat_url"] == "https://t.me/refreshed_shipdev_bot"
            assert data2["connect_url"] == "https://t.me/refreshed_shipdev_bot?start=ws_personal_default"

            # Verify persisted in database
            stored = _platform_repo.get_connection("ws_personal_default", PlatformType.TELEGRAM)
            assert stored["account_name"] == "@refreshed_shipdev_bot"


def test_telegram_deep_link_workspace_isolation(monkeypatch, tmp_path):
    """Verify deep links and connections remain isolated between Personal and Team workspaces."""
    test_db = str(tmp_path / "test_iso_ep.db")
    init_db(test_db)
    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite:///{test_db}")

    from app.api.v1.platforms import gateway, _platform_repo, orchestrator
    _platform_repo.db_path = test_db
    orchestrator.platform_repo.db_path = test_db
    orchestrator.task_repo.db_path = test_db

    adapter: TelegramAdapter = gateway.get_adapter(PlatformType.TELEGRAM)  # type: ignore
    adapter.set_bot_identity({
        "id": 998877,
        "is_bot": True,
        "first_name": "Isolated Bot",
        "username": "isolated_test_bot",
    })

    with TestClient(app) as client:
        # Check Personal workspace
        res_p = client.get("/api/v1/platforms/connections", headers={"X-Workspace-ID": "ws_personal_default"})
        tg_p = next(c for c in res_p.json() if c["platform"] == "telegram")
        assert tg_p["connect_url"] == "https://t.me/isolated_test_bot?start=ws_personal_default"

        # Check Team workspace
        res_t = client.get("/api/v1/platforms/connections", headers={"X-Workspace-ID": "ws_team_default"})
        tg_t = next(c for c in res_t.json() if c["platform"] == "telegram")
        assert tg_t["connect_url"] == "https://t.me/isolated_test_bot?start=ws_team_default"

        # Connect only Personal workspace
        client.post("/api/v1/platforms/telegram/connect", headers={"X-Workspace-ID": "ws_personal_default"})

        # Personal is connected, Team remains unconnected
        check_p = client.get("/api/v1/platforms/connections", headers={"X-Workspace-ID": "ws_personal_default"}).json()
        check_t = client.get("/api/v1/platforms/connections", headers={"X-Workspace-ID": "ws_team_default"}).json()

        assert next(c for c in check_p if c["platform"] == "telegram")["connected"] is True
        assert next(c for c in check_t if c["platform"] == "telegram")["connected"] is False


# =============================================================================
# 7. Telegram Human Approval Authorization & Security Tests
# =============================================================================

def test_telegram_authorized_workspace_owner_approval_via_settings(tg_test_env, monkeypatch):
    """Authorized workspace owner configured in settings can approve task and ship."""
    orchestrator = tg_test_env["orchestrator"]
    task_repo = tg_test_env["task_repo"]
    adapter = tg_test_env["adapter"]

    owner_user_id = "777888999"
    monkeypatch.setattr(settings, "TELEGRAM_OPERATOR_USER_ID", owner_user_id)
    monkeypatch.setattr(settings, "TELEGRAM_OPERATOR_WORKSPACE_ID", "ws_personal_default")

    # 1. Create task reaching AWAITING_HUMAN_APPROVAL
    exec_event = ChatEvent(
        event_id="tg_upd_owner_exec",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_owner",
        user_id=owner_user_id,
        user_handle="workspace_owner",
        message_text="Execute the improvements",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )
    exec_res = orchestrator.handle_chat_event(exec_event)
    task_id = exec_res["task_id"]

    # Verify task is awaiting approval
    task_before = task_repo.get_task(task_id, workspace_id="ws_personal_default")
    assert task_before.status == TaskStatus.AWAITING_HUMAN_APPROVAL

    # 2. Owner clicks [ Approve & Ship ] with valid cryptographic token
    cb_token = generate_approval_callback_data("approve", task_id, expires_in_seconds=3600)
    approve_event = ChatEvent(
        event_id="tg_cb_owner_approve",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_owner",
        user_id=owner_user_id,
        user_handle="workspace_owner",
        message_text="Button click: approve",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task_id,
        raw_payload={"callback_query": {"id": "cb_query_1", "data": cb_token}},
    )

    action_res = orchestrator.handle_chat_event(approve_event)
    assert action_res["status"] == "approved"
    assert action_res["task_id"] == task_id

    # 3. Verify task is COMPLETED
    task_after = task_repo.get_task(task_id, workspace_id="ws_personal_default")
    assert task_after.status == TaskStatus.COMPLETED

    # 4. Verify approval recorded against correct task and operator
    approvals = task_repo.get_approval_records_for_task(task_id)
    assert len(approvals) == 1
    assert approvals[0].task_id == task_id
    assert approvals[0].decision == "approved"
    assert approvals[0].reviewer_id == f"telegram:{owner_user_id}"


def test_telegram_unauthorized_user_cannot_approve(tg_test_env):
    """Unauthorized Telegram user is rejected with permission denied; task remains untouched."""
    orchestrator = tg_test_env["orchestrator"]
    task_repo = tg_test_env["task_repo"]
    adapter = tg_test_env["adapter"]

    # 1. Create task awaiting approval
    exec_event = ChatEvent(
        event_id="tg_upd_unauth_exec",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_test",
        user_id="111222333",
        message_text="Execute the improvements",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )
    exec_res = orchestrator.handle_chat_event(exec_event)
    task_id = exec_res["task_id"]

    # 2. Unauthorized attacker clicks [ Approve & Ship ]
    cb_token = generate_approval_callback_data("approve", task_id, expires_in_seconds=3600)
    attacker_event = ChatEvent(
        event_id="tg_cb_attacker_click",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_test",
        user_id="999000111",  # Unregistered, unauthorized user
        user_handle="attacker_spoof",
        message_text="Button click: approve",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task_id,
        raw_payload={"callback_query": {"id": "cb_attacker", "data": cb_token}},
    )

    action_res = orchestrator.handle_chat_event(attacker_event)
    assert action_res["status"] == "unauthorized"

    # Task must NOT be approved
    task = task_repo.get_task(task_id, workspace_id="ws_personal_default")
    assert task.status == TaskStatus.AWAITING_HUMAN_APPROVAL

    # Zero approval records created
    approvals = task_repo.get_approval_records_for_task(task_id)
    assert len(approvals) == 0


def test_telegram_team_workspace_user_cannot_approve_personal_task(tg_test_env):
    """Team workspace user cannot approve Personal Workspace tasks without explicit permission."""
    orchestrator = tg_test_env["orchestrator"]
    task_repo = tg_test_env["task_repo"]
    platform_repo = tg_test_env["platform_repo"]

    team_user_id = "555666777"
    # Pre-authorize user ONLY for Team workspace
    platform_repo.assign_reviewer_role(
        platform=PlatformType.TELEGRAM,
        user_id=team_user_id,
        role="operator",
        workspace_id="ws_team_default",
    )

    # Create task in Personal workspace
    exec_event = ChatEvent(
        event_id="tg_upd_iso_exec",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_iso",
        user_id="111222",
        message_text="Execute the improvements",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )
    exec_res = orchestrator.handle_chat_event(exec_event)
    task_id = exec_res["task_id"]

    # Verify task belongs to Personal workspace
    task = task_repo.get_task(task_id)
    assert task.workspace_id == "ws_personal_default"

    # Team user attempts to approve Personal workspace task
    cb_token = generate_approval_callback_data("approve", task_id, expires_in_seconds=3600)
    team_approve_event = ChatEvent(
        event_id="tg_cb_team_cross_approve",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_iso",
        user_id=team_user_id,
        message_text="Button click: approve",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task_id,
        raw_payload={"callback_query": {"data": cb_token}},
    )

    action_res = orchestrator.handle_chat_event(team_approve_event)
    assert action_res["status"] == "unauthorized"

    # Task remains in AWAITING_HUMAN_APPROVAL
    task_after = task_repo.get_task(task_id, workspace_id="ws_personal_default")
    assert task_after.status == TaskStatus.AWAITING_HUMAN_APPROVAL


def test_telegram_expired_approval_callback_rejected(tg_test_env, monkeypatch):
    """Expired approval callbacks are strictly rejected fail-closed."""
    orchestrator = tg_test_env["orchestrator"]
    task_repo = tg_test_env["task_repo"]

    owner_user_id = "888999111"
    monkeypatch.setattr(settings, "TELEGRAM_OPERATOR_USER_ID", owner_user_id)

    # Create task awaiting approval
    exec_event = ChatEvent(
        event_id="tg_upd_exp_exec",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_exp",
        user_id=owner_user_id,
        message_text="Execute the improvements",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )
    exec_res = orchestrator.handle_chat_event(exec_event)
    task_id = exec_res["task_id"]

    # Generate an expired callback token (expired 60 seconds ago)
    expired_token = generate_approval_callback_data("approve", task_id, expires_in_seconds=-60)
    expired_event = ChatEvent(
        event_id="tg_cb_expired_click",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_exp",
        user_id=owner_user_id,
        message_text="Button click: approve",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task_id,
        raw_payload={"callback_query": {"data": expired_token}},
    )

    action_res = orchestrator.handle_chat_event(expired_event)
    assert action_res["status"] == "expired"

    # Task must remain unapproved
    task = task_repo.get_task(task_id, workspace_id="ws_personal_default")
    assert task.status == TaskStatus.AWAITING_HUMAN_APPROVAL


def test_telegram_replayed_approval_callback_rejected(tg_test_env, monkeypatch):
    """Replayed approval callbacks on already completed tasks are rejected."""
    orchestrator = tg_test_env["orchestrator"]
    task_repo = tg_test_env["task_repo"]

    owner_user_id = "888999222"
    monkeypatch.setattr(settings, "TELEGRAM_OPERATOR_USER_ID", owner_user_id)

    exec_event = ChatEvent(
        event_id="tg_upd_replay_exec",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_replay",
        user_id=owner_user_id,
        message_text="Execute the improvements",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )
    exec_res = orchestrator.handle_chat_event(exec_event)
    task_id = exec_res["task_id"]

    cb_token = generate_approval_callback_data("approve", task_id, expires_in_seconds=3600)

    # 1. First approval succeeds
    click1 = ChatEvent(
        event_id="tg_cb_replay_click1",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_replay",
        user_id=owner_user_id,
        message_text="Button click: approve",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task_id,
        raw_payload={"callback_query": {"data": cb_token}},
    )
    res1 = orchestrator.handle_chat_event(click1)
    assert res1["status"] == "approved"

    # 2. Replay same approval on completed task
    click2 = ChatEvent(
        event_id="tg_cb_replay_click2",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_replay",
        user_id=owner_user_id,
        message_text="Button click: approve",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task_id,
        raw_payload={"callback_query": {"data": cb_token}},
    )
    res2 = orchestrator.handle_chat_event(click2)
    assert res2["status"] == "replay_rejected"


def test_telegram_request_changes_follows_same_authorization_checks(tg_test_env, monkeypatch):
    """Request Changes follows the exact same authorization, token, and audit checks as approval."""
    orchestrator = tg_test_env["orchestrator"]
    task_repo = tg_test_env["task_repo"]

    owner_user_id = "888999333"
    monkeypatch.setattr(settings, "TELEGRAM_OPERATOR_USER_ID", owner_user_id)

    exec_event = ChatEvent(
        event_id="tg_upd_changes_exec",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_changes",
        user_id=owner_user_id,
        message_text="Execute the improvements",
        mention_type=MentionType.DIRECT_MESSAGE,
        raw_payload={"message": {"chat": {"type": "private"}}},
    )
    exec_res = orchestrator.handle_chat_event(exec_event)
    task_id = exec_res["task_id"]

    reject_token = generate_approval_callback_data("reject", task_id, expires_in_seconds=3600)

    # 1. Unauthorized user attempting Request Changes is rejected
    unauth_reject = ChatEvent(
        event_id="tg_cb_unauth_reject",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_changes",
        user_id="unauthorized_actor",
        message_text="Button click: reject",
        mention_type=MentionType.ACTION,
        action_id="reject_task",
        action_value=task_id,
        raw_payload={"callback_query": {"data": reject_token}},
    )
    res_unauth = orchestrator.handle_chat_event(unauth_reject)
    assert res_unauth["status"] == "unauthorized"
    assert task_repo.get_task(task_id).status == TaskStatus.AWAITING_HUMAN_APPROVAL

    # 2. Authorized owner clicking Request Changes succeeds
    auth_reject = ChatEvent(
        event_id="tg_cb_auth_reject",
        platform=PlatformType.TELEGRAM,
        conversation_id="priv_conv_changes",
        user_id=owner_user_id,
        message_text="Button click: reject",
        mention_type=MentionType.ACTION,
        action_id="reject_task",
        action_value=task_id,
        raw_payload={"callback_query": {"data": reject_token}},
    )
    res_auth = orchestrator.handle_chat_event(auth_reject)
    assert res_auth["status"] == "revision_requested"

    # Task transitions back to FIX_PROPOSED
    task_after = task_repo.get_task(task_id)
    assert task_after.status == TaskStatus.FIX_PROPOSED

    # Rejection recorded in approval_records table
    approvals = task_repo.get_approval_records_for_task(task_id)
    assert len(approvals) == 1
    assert approvals[0].decision == "rejected"
    assert approvals[0].reviewer_id == f"telegram:{owner_user_id}"



