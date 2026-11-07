"""Unit tests for Phase P2: Slack, Teams, Discord, and Telegram platform adapters and endpoints."""

import hashlib
import hmac
import json
import time
import pytest
from fastapi.testclient import TestClient
from app.adapters.discord_adapter import DiscordAdapter
from app.adapters.slack_adapter import SlackAdapter
from app.adapters.teams_adapter import TeamsAdapter
from app.adapters.telegram_adapter import TelegramAdapter
from app.main import app
from app.models.platform import (
    MentionType,
    PlatformType,
    ReviewRequestPayload,
    TaskCategory,
)

client = TestClient(app)

# =============================================================================
# 1. Slack Adapter Tests
# =============================================================================
def test_slack_signature_verification():
    secret = "test-slack-secret"
    adapter = SlackAdapter(signing_secret=secret)

    now = int(time.time())
    body = b'{"type":"event_callback","event":{"text":"hello"}}'
    sig_basestring = f"v0:{now}:".encode("utf-8") + body
    valid_sig = "v0=" + hmac.new(secret.encode("utf-8"), sig_basestring, hashlib.sha256).hexdigest()

    # Valid signature
    assert adapter.verify_signature(
        {"x-slack-signature": valid_sig, "x-slack-request-timestamp": str(now)},
        body,
    ) is True

    # Tampered body fails
    assert adapter.verify_signature(
        {"x-slack-signature": valid_sig, "x-slack-request-timestamp": str(now)},
        b'{"type":"tampered"}',
    ) is False

    # Expired timestamp (> 300s old) fails
    old_time = now - 400
    old_basestring = f"v0:{old_time}:".encode("utf-8") + body
    old_sig = "v0=" + hmac.new(secret.encode("utf-8"), old_basestring, hashlib.sha256).hexdigest()
    assert adapter.verify_signature(
        {"x-slack-signature": old_sig, "x-slack-request-timestamp": str(old_time)},
        body,
    ) is False


def test_slack_url_verification_challenge():
    adapter = SlackAdapter(signing_secret="sec")
    body = json.dumps({"type": "url_verification", "challenge": "challenge_token_xyz"}).encode("utf-8")
    event = adapter.parse_webhook({}, body)
    assert event is not None
    assert event.action_id == "url_verification"
    assert event.action_value == "challenge_token_xyz"


def test_slack_block_action_parsing():
    adapter = SlackAdapter()
    payload_obj = {
        "type": "block_actions",
        "user": {"id": "U_ALICE", "name": "alice"},
        "channel": {"id": "C_DEVOPS"},
        "container": {"thread_ts": "171000.555"},
        "actions": [{"action_id": "approve_task", "value": "task_12345"}],
    }
    raw_str = f"payload={json.dumps(payload_obj)}"
    event = adapter.parse_webhook({}, raw_str.encode("utf-8"))
    assert event is not None
    assert event.platform == PlatformType.SLACK
    assert event.mention_type == MentionType.ACTION
    assert event.action_id == "approve_task"
    assert event.action_value == "task_12345"
    assert event.user_id == "U_ALICE"


# =============================================================================
# 2. Microsoft Teams Adapter Tests
# =============================================================================
def test_teams_signature_verification():
    secret = "teams-webhook-secret"
    adapter = TeamsAdapter(webhook_secret=secret)
    body = b'{"type":"message","text":"test"}'

    # Bearer token auth
    assert adapter.verify_signature({"Authorization": f"Bearer {secret}"}, body) is True
    assert adapter.verify_signature({"Authorization": "Bearer wrong-secret"}, body) is False

    # HMAC-SHA256 signature auth
    hmac_sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    assert adapter.verify_signature({"Authorization": f"HMAC {hmac_sig}"}, body) is True
    assert adapter.verify_signature({"Authorization": "HMAC badsig"}, body) is False


def test_teams_message_parsing_and_at_tag_stripping():
    adapter = TeamsAdapter()
    raw = {
        "type": "message",
        "id": "teams_act_001",
        "conversation": {"id": "teams_conv_99"},
        "from": {"id": "teams_u_42", "name": "Bob Lead"},
        "text": "<at>ShipDev</at> please check test suite failure",
    }
    event = adapter.parse_webhook({}, json.dumps(raw).encode("utf-8"))
    assert event is not None
    assert event.platform == PlatformType.TEAMS
    assert event.message_text == "please check test suite failure"
    assert event.user_display_name == "Bob Lead"
    assert event.mention_type == MentionType.MENTION


def test_teams_adaptive_card_action_submit_parsing():
    adapter = TeamsAdapter()
    raw = {
        "type": "message",
        "id": "teams_act_002",
        "conversation": {"id": "teams_conv_99"},
        "from": {"id": "teams_u_42"},
        "value": {"action": "approve_task", "task_id": "task_abc_789"},
    }
    event = adapter.parse_webhook({}, json.dumps(raw).encode("utf-8"))
    assert event is not None
    assert event.mention_type == MentionType.ACTION
    assert event.action_id == "approve_task"
    assert event.action_value == "task_abc_789"


# =============================================================================
# 3. Discord Adapter Tests
# =============================================================================
def test_discord_signature_verification():
    pubkey = "test-discord-public-key"
    adapter = DiscordAdapter(public_key=pubkey)
    body = b'{"type":1}'
    timestamp = "1710000000"
    message = timestamp.encode("utf-8") + body

    computed_sig = hmac.new(pubkey.encode("utf-8"), message, hashlib.sha256).hexdigest()
    headers = {"X-Signature-Ed25519": computed_sig, "X-Signature-Timestamp": timestamp}

    assert adapter.verify_signature(headers, body) is True
    assert adapter.verify_signature({"X-Signature-Ed25519": "bad", "X-Signature-Timestamp": timestamp}, body) is False


def test_discord_ping_handshake():
    adapter = DiscordAdapter()
    body = json.dumps({"type": 1, "id": "ping_123"}).encode("utf-8")
    event = adapter.parse_webhook({}, body)
    assert event is not None
    assert event.action_id == "discord_ping"
    assert event.action_value == "pong"


def test_discord_button_click_parsing():
    adapter = DiscordAdapter()
    body = json.dumps({
        "type": 3,
        "id": "interaction_btn_001",
        "channel_id": "ch_discord_888",
        "member": {"user": {"id": "disc_user_77", "username": "sarah_eng"}},
        "data": {"custom_id": "approve:task_disc_444"},
    }).encode("utf-8")

    event = adapter.parse_webhook({}, body)
    assert event is not None
    assert event.platform == PlatformType.DISCORD
    assert event.mention_type == MentionType.ACTION
    assert event.action_id == "approve_task"
    assert event.action_value == "task_disc_444"


# =============================================================================
# 4. Telegram Adapter Tests
# =============================================================================
def test_telegram_secret_token_verification():
    secret = "tg-secret-token-xyz"
    adapter = TelegramAdapter(webhook_secret=secret)

    assert adapter.verify_signature({"X-Telegram-Bot-Api-Secret-Token": secret}, b"{}") is True
    assert adapter.verify_signature({"X-Telegram-Bot-Api-Secret-Token": "wrong"}, b"{}") is False
    assert adapter.verify_signature({}, b"{}") is False


def test_telegram_message_and_callback_query_parsing():
    adapter = TelegramAdapter()

    # Standard Message
    msg_raw = {
        "update_id": 999111,
        "message": {
            "message_id": 555,
            "chat": {"id": -1001234567, "type": "supergroup"},
            "from": {"id": 123456, "first_name": "Dave", "username": "dave_dev"},
            "text": "ShipDev investigate flaky tests",
        },
    }
    event = adapter.parse_webhook({}, json.dumps(msg_raw).encode("utf-8"))
    assert event is not None
    assert event.platform == PlatformType.TELEGRAM
    assert event.conversation_id == "-1001234567"
    assert event.message_text == "ShipDev investigate flaky tests"
    assert event.user_handle == "dave_dev"

    # Callback Query (Inline Button Click)
    cb_raw = {
        "update_id": 999112,
        "callback_query": {
            "id": "cb_query_777",
            "from": {"id": 123456, "username": "dave_dev"},
            "message": {"chat": {"id": -1001234567}},
            "data": "approve:task_tg_888",
        },
    }
    cb_event = adapter.parse_webhook({}, json.dumps(cb_raw).encode("utf-8"))
    assert cb_event is not None
    assert cb_event.mention_type == MentionType.ACTION
    assert cb_event.action_id == "approve_task"
    assert cb_event.action_value == "task_tg_888"


# =============================================================================
# 5. Review Card Formatting Invariant Tests Across All 4 Platforms
# =============================================================================
def test_review_card_schemas_across_all_platforms():
    payload = ReviewRequestPayload(
        task_id="task_audit_999",
        title="Fix ZeroDivisionError in calculator.py",
        summary="Added zero check before division.",
        category=TaskCategory.ENGINEERING,
        patch_diff="- if b == 0:\n+ if b == 0: raise ValueError()",
        evidence_summary="3 passed in 0.05s",
        status="AWAITING_HUMAN_APPROVAL",
    )

    # Slack review card
    slack_adapter = SlackAdapter()
    slack_res = slack_adapter.send_review_card("C_TEST", payload)
    # unconfigured token reports clean failure without throwing
    assert slack_res.success is False
    assert "SLACK_BOT_TOKEN" in slack_res.error

    # Teams review card
    teams_adapter = TeamsAdapter()
    teams_res = teams_adapter.send_review_card("conv_test", payload)
    assert teams_res.success is False
    assert "TEAMS_INCOMING_WEBHOOK_URL" in teams_res.error

    # Discord review card
    discord_adapter = DiscordAdapter()
    discord_res = discord_adapter.send_review_card("ch_test", payload)
    assert discord_res.success is False
    assert "DISCORD" in discord_res.error

    # Telegram review card
    telegram_adapter = TelegramAdapter()
    telegram_res = telegram_adapter.send_review_card("chat_test", payload)
    assert telegram_res.success is False
    assert "TELEGRAM_BOT_TOKEN" in telegram_res.error


# =============================================================================
# 6. API Platform Endpoints Tests
# =============================================================================
def test_api_platforms_health():
    resp = client.get("/api/v1/platforms/health")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 4
    platforms = [item["platform"] for item in data]
    assert "slack" in platforms
    assert "teams" in platforms
    assert "discord" in platforms
    assert "telegram" in platforms

