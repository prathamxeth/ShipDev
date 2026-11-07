"""Phase 2 P5 Acceptance Tests: Full End-to-End Multi-Platform Teammate Round-Trip.

Tests complete round-trip lifecycle for:
1. Slack
2. Microsoft Teams
3. Discord
4. Telegram

Inbound Mention -> Intent Classification -> Task Blueprint -> Specialist Assignment ->
Sandboxed Verification -> Interactive Review Card -> Server-Side Role Gate ->
Human Approval -> Deployment & Completion Notice Delivery.
"""

import hashlib
import hmac
import json
import time
import pytest
from app.core.orchestrator import UniversalOrchestrator
from app.core.platform_gateway import PlatformGateway
from app.core.state_machine import CallerType, TaskStatus
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
from app.models.task import (
    ApprovalRequest,
    EvidenceCreate,
    TaskCreate,
    TransitionRequest,
)
from app.repositories.platform_repository import PlatformRepository
from app.repositories.task_repository import TaskRepository
from app.services.review_dispatcher import ReviewDispatcher


class RecordingPlatformAdapter:
    """Mock recording adapter that emulates real platform network dispatch."""

    def __init__(self, platform_type: PlatformType):
        self.platform_type = platform_type
        self.sent_messages: list[OutboundMessage] = []
        self.sent_review_cards: list[tuple[str, ReviewRequestPayload, str]] = []

    def verify_signature(self, headers, body_bytes) -> bool:
        return True

    def parse_webhook(self, headers, body_bytes):
        return None

    def format_message(self, message: OutboundMessage):
        return {"text": message.text}

    def send_message(self, message: OutboundMessage) -> DeliveryResult:
        self.sent_messages.append(message)
        return DeliveryResult(
            success=True,
            platform=self.platform_type,
            message_id=f"msg_{len(self.sent_messages)}",
        )

    def send_review_card(self, conversation_id, payload, thread_id=None) -> DeliveryResult:
        self.sent_review_cards.append((conversation_id, payload, thread_id or ""))
        return DeliveryResult(
            success=True,
            platform=self.platform_type,
            message_id=f"card_{len(self.sent_review_cards)}",
        )

    def is_configured(self) -> bool:
        return True

    def get_health(self) -> PlatformHealth:
        return PlatformHealth(platform=self.platform_type, configured=True, status="healthy")


@pytest.fixture
def e2e_system(tmp_path):
    db_file = str(tmp_path / "test_p5_e2e.db")
    init_db(db_file)
    task_repo = TaskRepository(db_file)
    platform_repo = PlatformRepository(db_file)

    gateway = PlatformGateway(repository=platform_repo)
    adapters = {
        PlatformType.SLACK: RecordingPlatformAdapter(PlatformType.SLACK),
        PlatformType.TEAMS: RecordingPlatformAdapter(PlatformType.TEAMS),
        PlatformType.DISCORD: RecordingPlatformAdapter(PlatformType.DISCORD),
        PlatformType.TELEGRAM: RecordingPlatformAdapter(PlatformType.TELEGRAM),
    }
    for adapter in adapters.values():
        gateway.register_adapter(adapter)

    orchestrator = UniversalOrchestrator(
        gateway=gateway,
        task_repo=task_repo,
        platform_repo=platform_repo,
    )
    dispatcher = ReviewDispatcher(
        gateway=gateway,
        task_repo=task_repo,
        platform_repo=platform_repo,
    )

    return task_repo, platform_repo, adapters, orchestrator, dispatcher


@pytest.mark.parametrize(
    "platform,conversation_id,thread_id,user_id,prompt,expected_category",
    [
        (
            PlatformType.SLACK,
            "C_SLACK_ENG",
            "1710000001.000100",
            "U_SLACK_DEV",
            "@ShipDev calculate_discount adds markup instead of subtracting discount in calculator.py line 22",
            TaskCategory.ENGINEERING,
        ),
        (
            PlatformType.TEAMS,
            "teams-conv-44",
            "msg-thread-1",
            "teams-lead-user",
            "@ShipDev Investigate and benchmark sqlite WAL mode performance versus truncate",
            TaskCategory.RESEARCH,
        ),
        (
            PlatformType.DISCORD,
            "discord-chan-ops",
            None,
            "discord-mod-88",
            "@ShipDev Plan migration roadmap and milestones for Kubernetes staging cluster",
            TaskCategory.PLANNING,
        ),
        (
            PlatformType.TELEGRAM,
            "tg-chat-999",
            None,
            "tg-user-77",
            "/shipdev Document deployment runbook and rollback procedure for v2 release",
            TaskCategory.WRITING,
        ),
    ],
)
def test_full_e2e_platform_lifecycle(
    e2e_system,
    platform,
    conversation_id,
    thread_id,
    user_id,
    prompt,
    expected_category,
):
    task_repo, platform_repo, adapters, orchestrator, dispatcher = e2e_system
    adapter = adapters[platform]

    # Pre-authorize user as engineering reviewer
    platform_repo.assign_reviewer_role(
        platform=platform,
        user_id=user_id,
        role="reviewer",
    )

    # STEP 1: Inbound Mention
    inbound_event = ChatEvent(
        event_id=f"evt_{platform.value}_1",
        platform=platform,
        conversation_id=conversation_id,
        thread_id=thread_id,
        user_id=user_id,
        user_display_name=f"{platform.value}_user",
        message_text=prompt,
        mention_type=MentionType.MENTION,
    )

    create_res = orchestrator.handle_chat_event(inbound_event)
    assert create_res["status"] == "task_created"
    task_id = create_res["task_id"]
    assert create_res["category"] == expected_category.value
    assert len(create_res["assigned_agents"]) >= 1

    # Verify Acknowledgment was posted to conversation
    assert len(adapter.sent_messages) == 1
    assert task_id in adapter.sent_messages[0].text
    assert "ShipDev Acknowledged" in adapter.sent_messages[0].text

    # STEP 2: Task Execution & State Advancement
    task_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.TRIAGED,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-triager",
            reason="Issue isolated",
        ),
    )
    task_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCING,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-triager",
            reason="Repro starting",
        ),
    )
    repro_ev = task_repo.add_evidence(
        task_id,
        EvidenceCreate(
            stage="reproduction",
            command_executed="pytest demo/tests/",
            exit_code=1,
            stdout="AssertionError: Expected discount deduction",
        ),
    )
    task_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCED,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-triager",
            reason="Repro confirmed defect",
            evidence_id=repro_ev.id,
        ),
    )
    task_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.FIX_PROPOSED,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-fixer",
            reason="Targeted fix generated",
        ),
    )
    task_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.VERIFYING,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-verifier",
            reason="Verification run in sandbox",
        ),
    )
    ver_ev = task_repo.add_evidence(
        task_id,
        EvidenceCreate(
            stage="verification",
            command_executed="pytest demo/tests/",
            exit_code=0,
            stdout="PASSED: 1 test in sandbox",
            patch_diff="--- a/target.py\n+++ b/target.py\n@@ -1,1 +1,1 @@\n-broken()\n+fixed()",
        ),
    )
    task_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.AWAITING_HUMAN_APPROVAL,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-verifier",
            reason="Independent verification clean",
            evidence_id=ver_ev.id,
        ),
    )

    # STEP 3: Dispatch Interactive Review Card
    review_delivery = dispatcher.dispatch_review_request(task_id)
    assert review_delivery.success is True
    assert len(adapter.sent_review_cards) == 1
    sent_card = adapter.sent_review_cards[0]
    assert sent_card[0] == conversation_id
    assert sent_card[1].task_id == task_id
    assert sent_card[1].patch_diff is not None

    # STEP 4: Human Review Decision (Authorized Approve)
    action_event = ChatEvent(
        event_id=f"evt_{platform.value}_action",
        platform=platform,
        conversation_id=conversation_id,
        thread_id=thread_id,
        user_id=user_id,
        user_display_name=f"{platform.value}_user",
        message_text="Approve",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task_id,
    )

    decision_res = orchestrator.handle_chat_event(action_event)
    assert decision_res["status"] == "approved"

    # Verify task state reached COMPLETED
    completed_task = task_repo.get_task(task_id)
    assert completed_task.status == TaskStatus.COMPLETED

    # Verify Completion Message was delivered to platform conversation
    assert len(adapter.sent_messages) == 2
    completion_msg = adapter.sent_messages[1]
    assert "Task Approved & Shipped!" in completion_msg.text
    assert task_id in completion_msg.text
