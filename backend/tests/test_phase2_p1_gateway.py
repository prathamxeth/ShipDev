"""Unit tests for Phase P1: Universal Platform Gateway, Normalized Event Model, and Correlations."""

import pytest
import uuid
from app.adapters.base import BasePlatformAdapter
from app.core.platform_gateway import PlatformGateway, PlatformSecurityError
from app.db.session import init_db
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


@pytest.fixture
def repo(tmp_path):
    db_file = str(tmp_path / "test_gateway.db")
    init_db(db_file)
    return PlatformRepository(db_file)


@pytest.fixture
def task_repo(tmp_path):
    db_file = str(tmp_path / "test_gateway.db")
    init_db(db_file)
    return TaskRepository(db_file)


class MockValidAdapter(BasePlatformAdapter):
    def __init__(self, platform_type: PlatformType = PlatformType.SLACK):
        super().__init__(platform_type)
        self.sent_messages = []
        self.sent_reviews = []

    def verify_signature(self, headers, body_bytes) -> bool:
        return headers.get("X-Test-Signature") == "valid-sig"

    def parse_webhook(self, headers, body_bytes):
        return ChatEvent(
            event_id="evt_test_123",
            platform=self.platform_type,
            conversation_id="C12345",
            thread_id="T67890",
            user_id="U999",
            user_display_name="Engineer Alex",
            message_text="@ShipDev fix discount formula in calculator.py",
            mention_type=MentionType.MENTION,
        )

    def format_message(self, message: OutboundMessage):
        return {"text": message.text}

    def send_message(self, message: OutboundMessage) -> DeliveryResult:
        self.sent_messages.append(message)
        return DeliveryResult(success=True, platform=self.platform_type, message_id="msg_out_1")

    def send_review_card(self, conversation_id, payload, thread_id=None) -> DeliveryResult:
        self.sent_reviews.append((conversation_id, payload, thread_id))
        return DeliveryResult(success=True, platform=self.platform_type, message_id="msg_rev_1")

    def is_configured(self) -> bool:
        return True

    def get_health(self) -> PlatformHealth:
        return PlatformHealth(platform=self.platform_type, configured=True, status="healthy")


# =============================================================================
# 1. ChatEvent Schema & Normalization Tests
# =============================================================================
def test_chat_event_model():
    evt = ChatEvent(
        event_id="evt_01",
        platform=PlatformType.SLACK,
        conversation_id="C_GENERAL",
        thread_id="171000.123",
        user_id="U_ALEX",
        user_display_name="Alex Doe",
        message_text="Help investigate 500 error on checkout",
        mention_type=MentionType.MENTION,
    )
    assert evt.event_id == "evt_01"
    assert evt.platform == PlatformType.SLACK
    assert evt.conversation_id == "C_GENERAL"
    assert evt.mention_type == MentionType.MENTION
    assert "timestamp" in evt.model_dump()


# =============================================================================
# 2. Event Deduplication Tests
# =============================================================================
def test_event_deduplication(repo):
    assert repo.is_event_processed("evt_uniq_1") is False
    repo.mark_event_processed("evt_uniq_1", PlatformType.SLACK)
    assert repo.is_event_processed("evt_uniq_1") is True
    # Idempotent re-marking does not raise error
    repo.mark_event_processed("evt_uniq_1", PlatformType.SLACK)
    assert repo.is_event_processed("evt_uniq_1") is True


# =============================================================================
# 3. Conversation-to-Task Correlation Tests
# =============================================================================
from app.models.task import TaskCreate

def test_conversation_task_mapping_lifecycle(repo, task_repo):
    task = task_repo.create_task(
        TaskCreate(
            title="Slack reported bug",
            description="Fix discount calculator",
            reported_by="slack:U12345",
        )
    )

    mapping = repo.create_mapping(
        platform=PlatformType.SLACK,
        conversation_id="C_PROD_ALERTS",
        thread_id="170999.001",
        user_id="U12345",
        user_display_name="Operator Sam",
        task_id=task.id,
        intent_category=TaskCategory.ENGINEERING,
        status="REPORTED",
    )

    assert mapping.platform == PlatformType.SLACK
    assert mapping.conversation_id == "C_PROD_ALERTS"
    assert mapping.thread_id == "170999.001"
    assert mapping.task_id == task.id

    # Active lookup by conversation + thread
    active = repo.get_active_mapping(PlatformType.SLACK, "C_PROD_ALERTS", "170999.001")
    assert active is not None
    assert active.id == mapping.id

    # Lookup by task_id
    by_task = repo.get_mapping_by_task_id(task.id)
    assert by_task is not None
    assert by_task.id == mapping.id

    # Status update
    repo.update_mapping_status(task.id, "AWAITING_HUMAN_APPROVAL")
    updated = repo.get_mapping_by_id(mapping.id)
    assert updated.status == "AWAITING_HUMAN_APPROVAL"

    # Terminal status excludes from active lookup
    repo.update_mapping_status(task.id, "COMPLETED")
    active_terminal = repo.get_active_mapping(PlatformType.SLACK, "C_PROD_ALERTS", "170999.001")
    assert active_terminal is None


# =============================================================================
# 4. Reviewer Role Management Tests (Anti-Spoofing)
# =============================================================================
def test_reviewer_role_assignments(repo):
    # Default unassigned user is NOT authorized
    assert repo.is_authorized_reviewer(PlatformType.SLACK, "U_UNAUTHORIZED") is False

    # Assign operator role
    repo.assign_reviewer_role(
        platform=PlatformType.SLACK,
        user_id="U_AUTHORIZED_LEAD",
        role="lead",
        assigned_by="admin-operator",
        user_handle="@alex.lead",
    )

    roles = repo.get_user_roles(PlatformType.SLACK, "U_AUTHORIZED_LEAD")
    assert "lead" in roles
    assert repo.is_authorized_reviewer(PlatformType.SLACK, "U_AUTHORIZED_LEAD") is True

    # Platform isolation: Slack role does NOT grant authorization on Teams
    assert repo.is_authorized_reviewer(PlatformType.TEAMS, "U_AUTHORIZED_LEAD") is False


# =============================================================================
# 5. Platform Gateway Inbound & Outbound Pipeline
# =============================================================================
def test_platform_gateway_signature_fail_closed(repo):
    gateway = PlatformGateway(repository=repo)
    adapter = MockValidAdapter(PlatformType.SLACK)
    gateway.register_adapter(adapter)

    # Missing or invalid signature raises PlatformSecurityError
    with pytest.raises(PlatformSecurityError):
        gateway.process_inbound_webhook(
            PlatformType.SLACK,
            headers={"X-Test-Signature": "invalid-sig"},
            body_bytes=b"{}",
        )


def test_platform_gateway_event_processing_and_deduplication(repo):
    gateway = PlatformGateway(repository=repo)
    adapter = MockValidAdapter(PlatformType.SLACK)
    gateway.register_adapter(adapter)

    # First delivery succeeds
    event = gateway.process_inbound_webhook(
        PlatformType.SLACK,
        headers={"X-Test-Signature": "valid-sig"},
        body_bytes=b"{}",
    )
    assert event is not None
    assert event.event_id == "evt_test_123"

    # Replay of same event is cleanly ignored (returns None)
    event_replay = gateway.process_inbound_webhook(
        PlatformType.SLACK,
        headers={"X-Test-Signature": "valid-sig"},
        body_bytes=b"{}",
    )
    assert event_replay is None


def test_platform_gateway_outbound_dispatch(repo):
    gateway = PlatformGateway(repository=repo)
    adapter = MockValidAdapter(PlatformType.SLACK)
    gateway.register_adapter(adapter)

    msg = OutboundMessage(
        platform=PlatformType.SLACK,
        conversation_id="C12345",
        text="Analysis complete. All 4 tests verified.",
    )
    result = gateway.send_outbound(msg)
    assert result.success is True
    assert len(adapter.sent_messages) == 1

    # Unregistered platform outbound returns clear failure
    unregistered_msg = OutboundMessage(
        platform=PlatformType.DISCORD,
        conversation_id="ch_999",
        text="Hello",
    )
    unreg_result = gateway.send_outbound(unregistered_msg)
    assert unreg_result.success is False
    assert "not registered" in unreg_result.error
