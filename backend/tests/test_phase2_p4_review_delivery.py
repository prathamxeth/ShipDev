"""Phase 2 P4 Acceptance Tests: Review Dispatcher, Human Decision Workflow, and Chat Delivery."""

import pytest
from app.core.orchestrator import UniversalOrchestrator
from app.core.platform_gateway import PlatformGateway
from app.core.state_machine import CallerType, TaskStatus
from app.db.session import init_db
from app.models.platform import (
    ChatEvent,
    ConversationTaskMapping,
    MentionType,
    PlatformType,
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


@pytest.fixture
def clean_repos(tmp_path):
    db_file = str(tmp_path / "test_p4.db")
    init_db(db_file)
    task_repo = TaskRepository(db_file)
    platform_repo = PlatformRepository(db_file)
    return task_repo, platform_repo


def test_review_dispatcher_sends_review_card_for_linked_task(clean_repos):
    task_repo, platform_repo = clean_repos
    gateway = PlatformGateway(repository=platform_repo)
    dispatcher = ReviewDispatcher(gateway=gateway, task_repo=task_repo, platform_repo=platform_repo)

    # 1. Create task
    task = task_repo.create_task(
        TaskCreate(
            title="Fix discount calculation",
            description="Discount logic adds markup instead of subtracting.",
            reported_by="slack:U12345",
        )
    )

    # 2. Correlate with Slack conversation
    mapping = platform_repo.create_mapping(
        platform=PlatformType.SLACK,
        conversation_id="C_SLACK_ENG",
        thread_id="1710000000.123456",
        user_id="U12345",
        task_id=task.id,
        intent_category=TaskCategory.ENGINEERING,
    )

    # 3. Advance to FIX_PROPOSED with reproduction and verification evidence
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.TRIAGED,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-triager",
            reason="Triage complete",
        ),
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCING,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-triager",
            reason="Repro starting",
        ),
    )
    repro_ev = task_repo.add_evidence(
        task.id,
        EvidenceCreate(
            stage="reproduction",
            command_executed="pytest demo/tests/test_calculator.py",
            exit_code=1,
            stdout="FAILED: test_calculate_discount",
        ),
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCED,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-triager",
            reason="Repro confirmed defect",
            evidence_id=repro_ev.id,
        ),
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.FIX_PROPOSED,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-fixer",
            reason="Patch crafted",
        ),
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.VERIFYING,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-verifier",
            reason="Verification run",
        ),
    )
    ver_ev = task_repo.add_evidence(
        task.id,
        EvidenceCreate(
            stage="verification",
            command_executed="pytest demo/tests/test_calculator.py",
            exit_code=0,
            stdout="PASSED 1 test",
            patch_diff="--- a/calculator.py\n+++ b/calculator.py\n@@ -22,1 +22,1 @@\n-return price + discount\n+return price - discount",
        ),
    )

    # 4. Advance to AWAITING_HUMAN_APPROVAL
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.AWAITING_HUMAN_APPROVAL,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-verifier",
            reason="Verified clean",
            evidence_id=ver_ev.id,
        ),
    )

    # 5. Dispatch review request
    delivery = dispatcher.dispatch_review_request(task.id)
    assert delivery is not None
    # Because Slack token isn't configured in test env, adapter cleanly reports configuration status
    assert "SLACK" in delivery.platform.value.upper()


def test_review_dispatcher_noop_for_unlinked_task(clean_repos):
    task_repo, platform_repo = clean_repos
    dispatcher = ReviewDispatcher(task_repo=task_repo, platform_repo=platform_repo)

    task = task_repo.create_task(
        TaskCreate(
            title="Local Web UI Bug",
            description="Created via browser",
            reported_by="local-engineer",
        )
    )

    delivery = dispatcher.dispatch_review_request(task.id)
    assert delivery is None


def test_unauthorized_user_cannot_approve_via_chat(clean_repos):
    task_repo, platform_repo = clean_repos
    orchestrator = UniversalOrchestrator(task_repo=task_repo, platform_repo=platform_repo)

    task = task_repo.create_task(
        TaskCreate(
            title="Bug to review",
            description="Needs human review",
            reported_by="discord:alice",
        )
    )

    # Unauthorized event from a random user
    action_event = ChatEvent(
        event_id="evt_unauth_1",
        platform=PlatformType.DISCORD,
        conversation_id="ch_123",
        user_id="user_unauthorized_999",
        user_display_name="Random Hacker",
        message_text="Approve",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task.id,
    )

    result = orchestrator.handle_chat_event(action_event)
    assert result["status"] == "unauthorized"

    # Verify task status was NOT modified
    current_task = task_repo.get_task(task.id)
    assert current_task.status == TaskStatus.REPORTED


def test_authorized_user_approval_workflow(clean_repos):
    task_repo, platform_repo = clean_repos
    orchestrator = UniversalOrchestrator(task_repo=task_repo, platform_repo=platform_repo)

    # Authorize reviewer
    platform_repo.assign_reviewer_role(
        platform=PlatformType.DISCORD,
        user_id="lead_eng_42",
        role="engineering_lead",
    )

    task = task_repo.create_task(
        TaskCreate(
            title="Critical memory leak",
            description="Buffer not released",
            reported_by="discord:lead_eng_42",
        )
    )

    # Transition up to AWAITING_HUMAN_APPROVAL with proper verification evidence
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.TRIAGED,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-triager",
            reason="Triage done",
        ),
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCING,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-triager",
            reason="Repro",
        ),
    )
    repro_ev = task_repo.add_evidence(
        task.id,
        EvidenceCreate(
            stage="reproduction",
            command_executed="pytest",
            exit_code=1,
            stdout="Failed",
        ),
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCED,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-triager",
            reason="Confirmed",
            evidence_id=repro_ev.id,
        ),
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.FIX_PROPOSED,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-fixer",
            reason="Fix proposed",
        ),
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.VERIFYING,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-verifier",
            reason="Verifying",
        ),
    )
    ver_ev = task_repo.add_evidence(
        task.id,
        EvidenceCreate(
            stage="verification",
            command_executed="pytest",
            exit_code=0,
            stdout="Passed",
            patch_diff="--- a/mem.py\n+++ b/mem.py\n@@ -1,1 +1,1 @@\n-leak()\n+clean()",
        ),
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.AWAITING_HUMAN_APPROVAL,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-verifier",
            reason="Verified clean",
            evidence_id=ver_ev.id,
        ),
    )

    # Authorized operator clicks Approve
    approve_event = ChatEvent(
        event_id="evt_appr_1",
        platform=PlatformType.DISCORD,
        conversation_id="ch_dev",
        user_id="lead_eng_42",
        user_display_name="Lead Engineer",
        message_text="Approve & Deploy",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task.id,
    )

    decision_res = orchestrator.handle_chat_event(approve_event)
    assert decision_res["status"] == "approved"

    # Verify task reached COMPLETED
    updated_task = task_repo.get_task(task.id)
    assert updated_task.status == TaskStatus.COMPLETED


def test_authorized_user_rejection_workflow(clean_repos):
    task_repo, platform_repo = clean_repos
    orchestrator = UniversalOrchestrator(task_repo=task_repo, platform_repo=platform_repo)

    # Authorize reviewer for Telegram
    platform_repo.assign_reviewer_role(
        platform=PlatformType.TELEGRAM,
        user_id="tg_reviewer_99",
        role="qa_manager",
    )

    task = task_repo.create_task(
        TaskCreate(
            title="UI Alignment defect",
            description="Button overflows container",
            reported_by="telegram:tg_reviewer_99",
        )
    )

    # Advance to AWAITING_HUMAN_APPROVAL
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.TRIAGED,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-triager",
            reason="Triaged",
        ),
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCING,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-triager",
            reason="Repro",
        ),
    )
    repro_ev = task_repo.add_evidence(
        task.id,
        EvidenceCreate(
            stage="reproduction",
            command_executed="npm test",
            exit_code=1,
            stdout="Failed",
        ),
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCED,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-triager",
            reason="Confirmed",
            evidence_id=repro_ev.id,
        ),
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.FIX_PROPOSED,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-fixer",
            reason="Proposed",
        ),
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.VERIFYING,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-verifier",
            reason="Verifying",
        ),
    )
    ver_ev = task_repo.add_evidence(
        task.id,
        EvidenceCreate(
            stage="verification",
            command_executed="npm test",
            exit_code=0,
            stdout="Passed",
            patch_diff="--- a/btn.css\n+++ b/btn.css\n@@ -1,1 +1,1 @@\n-overflow: visible\n+overflow: hidden",
        ),
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.AWAITING_HUMAN_APPROVAL,
            actor_type=CallerType.AGENT,
            actor_id="shipdev-verifier",
            reason="Ready for review",
            evidence_id=ver_ev.id,
        ),
    )

    # Reviewer clicks Reject
    reject_event = ChatEvent(
        event_id="evt_rej_1",
        platform=PlatformType.TELEGRAM,
        conversation_id="tg_group_1",
        user_id="tg_reviewer_99",
        user_display_name="QA Lead",
        message_text="Reject & Revise",
        mention_type=MentionType.ACTION,
        action_id="reject_task",
        action_value=task.id,
    )

    decision_res = orchestrator.handle_chat_event(reject_event)
    assert decision_res["status"] == "revision_requested"

    # Task must return to FIX_PROPOSED
    updated_task = task_repo.get_task(task.id)
    assert updated_task.status == TaskStatus.FIX_PROPOSED
