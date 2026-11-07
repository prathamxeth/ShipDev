"""Unit tests for Phase P3: Universal Intent Classification, Task Planning, and Multi-Agent Orchestration."""

import pytest
from app.agents.registry import SpecialistAgentRegistry
from app.core.intent_classifier import UniversalIntentClassifier
from app.core.orchestrator import UniversalOrchestrator
from app.core.platform_gateway import PlatformGateway
from app.core.task_planner import UniversalTaskPlanner
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


class MockRecordingAdapter:
    def __init__(self, platform_type: PlatformType = PlatformType.SLACK):
        self.platform_type = platform_type
        self.outbound_messages: list[OutboundMessage] = []

    def verify_signature(self, headers, body_bytes) -> bool:
        return True

    def parse_webhook(self, headers, body_bytes):
        return None

    def format_message(self, message):
        return {"text": message.text}

    def send_message(self, message: OutboundMessage) -> DeliveryResult:
        self.outbound_messages.append(message)
        return DeliveryResult(success=True, platform=self.platform_type, message_id="rec_msg_1")

    def send_review_card(self, conversation_id, payload, thread_id=None) -> DeliveryResult:
        return DeliveryResult(success=True, platform=self.platform_type, message_id="rec_card_1")

    def is_configured(self) -> bool:
        return True

    def get_health(self) -> PlatformHealth:
        return PlatformHealth(platform=self.platform_type, configured=True, status="healthy")


@pytest.fixture
def test_env(tmp_path):
    db_file = str(tmp_path / "test_p3.db")
    init_db(db_file)
    task_repo = TaskRepository(db_file)
    platform_repo = PlatformRepository(db_file)

    gateway = PlatformGateway(repository=platform_repo)
    slack_mock = MockRecordingAdapter(PlatformType.SLACK)
    gateway.register_adapter(slack_mock)

    classifier = UniversalIntentClassifier()
    planner = UniversalTaskPlanner()
    agents = SpecialistAgentRegistry()

    orchestrator = UniversalOrchestrator(
        gateway=gateway,
        task_repo=task_repo,
        platform_repo=platform_repo,
        classifier=classifier,
        planner=planner,
        agent_registry=agents,
    )
    return {
        "orchestrator": orchestrator,
        "task_repo": task_repo,
        "platform_repo": platform_repo,
        "slack_mock": slack_mock,
        "classifier": classifier,
        "planner": planner,
        "agents": agents,
    }


# =============================================================================
# 1. Intent Classification Tests Across 5 Universal Categories
# =============================================================================
def test_universal_intent_classification(test_env):
    clf = test_env["classifier"]

    # 1. Engineering
    res_eng = clf.classify("Fix ZeroDivisionError in calculator.py line 22: regression test failing")
    assert res_eng.category == TaskCategory.ENGINEERING
    assert res_eng.confidence >= 0.7
    assert "calculator.py" in res_eng.entities.get("files", [])
    assert "ZeroDivisionError" in res_eng.entities.get("errors", [])
    assert 22 in res_eng.entities.get("line_numbers", [])

    # 2. Research
    res_res = clf.classify("Research modern state machine libraries and compare alternative architectures")
    assert res_res.category == TaskCategory.RESEARCH
    assert res_res.confidence >= 0.7

    # 3. Planning
    res_plan = clf.classify("Draft a phased roadmap and task breakdown milestone schedule")
    assert res_plan.category == TaskCategory.PLANNING
    assert res_plan.confidence >= 0.7

    # 4. Writing
    res_wri = clf.classify("Write API documentation and update README changelog for the new release")
    assert res_wri.category == TaskCategory.WRITING
    assert res_wri.confidence >= 0.7

    # 5. Analysis
    res_ana = clf.classify("Diagnose performance bottleneck and analyze latency metrics in execution logs")
    assert res_ana.category == TaskCategory.ANALYSIS
    assert res_ana.confidence >= 0.7


# =============================================================================
# 2. Universal Task Planner & Blueprint Tests
# =============================================================================
def test_universal_task_planner(test_env):
    planner = test_env["planner"]

    plan = planner.plan_task(
        category=TaskCategory.ENGINEERING,
        title="Fix ZeroDivisionError in calculator.py",
        entities={"files": ["calculator.py"]},
    )
    assert plan.category == TaskCategory.ENGINEERING
    assert "code_triage" in plan.required_capabilities
    assert "sandbox_verification" in plan.required_capabilities
    assert "pytest" in plan.required_tools
    assert plan.approval_policy == "mandatory_human_signoff"
    assert "calculator.py" in plan.target_files


# =============================================================================
# 3. Specialist Agent Registry & Capability Selection
# =============================================================================
def test_agent_capability_selection(test_env):
    agents = test_env["agents"]

    # Engineering capability matching
    eng_agents = agents.select_agents_for_capabilities(["code_triage", "sandbox_verification"])
    agent_ids = [a.agent_id for a in eng_agents]
    assert "shipdev-triager" in agent_ids
    assert "shipdev-verifier" in agent_ids

    # Research capability matching
    res_agents = agents.select_agents_for_capabilities(["codebase_research"])
    assert len(res_agents) >= 1
    assert res_agents[0].agent_id == "shipdev-researcher"


# =============================================================================
# 4. End-to-End Inbound Event Orchestration (Task Creation & Acknowledgment)
# =============================================================================
def test_orchestrator_handles_chat_event_and_correlates(test_env):
    orc = test_env["orchestrator"]
    slack_mock = test_env["slack_mock"]
    platform_repo = test_env["platform_repo"]
    task_repo = test_env["task_repo"]

    event = ChatEvent(
        event_id="evt_slack_001",
        platform=PlatformType.SLACK,
        conversation_id="C_ENG_CHANNEL",
        thread_id="171000.999",
        user_id="U_DEV_LEAD",
        user_display_name="Dev Lead Jordan",
        message_text="Fix ZeroDivisionError in calculator.py line 22",
        mention_type=MentionType.MENTION,
    )

    result = orc.handle_chat_event(event)
    assert result["status"] == "task_created"
    task_id = result["task_id"]
    assert result["category"] == "engineering"

    # Verify task exists in SQLite backend in REPORTED state
    task = task_repo.get_task(task_id)
    assert task is not None
    assert task.status.value == "REPORTED"

    # Verify conversation correlation mapping created
    mapping = platform_repo.get_active_mapping(PlatformType.SLACK, "C_ENG_CHANNEL", "171000.999")
    assert mapping is not None
    assert mapping.task_id == task_id

    # Verify acknowledgment message sent to Slack channel thread
    assert len(slack_mock.outbound_messages) == 1
    ack = slack_mock.outbound_messages[0]
    assert ack.conversation_id == "C_ENG_CHANNEL"
    assert ack.thread_id == "171000.999"
    assert task_id in ack.text
    assert "ENGINEERING" in ack.text


# =============================================================================
# 5. Human Review Workflow Governance (Authorization, Approval, Rejection)
# =============================================================================
def test_unauthorized_user_cannot_approve_task(test_env):
    orc = test_env["orchestrator"]
    slack_mock = test_env["slack_mock"]

    review_event = ChatEvent(
        event_id="act_btn_01",
        platform=PlatformType.SLACK,
        conversation_id="C_ENG_CHANNEL",
        thread_id="171000.999",
        user_id="U_UNAUTHORIZED_GUEST",
        message_text="Approve",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value="task_dummy_123",
    )

    res = orc.handle_review_action(review_event)
    assert res["status"] == "unauthorized"

    # Permission denied message sent
    assert any("Permission Denied" in m.text for m in slack_mock.outbound_messages)


def test_authorized_user_approves_task_and_ships(test_env):
    orc = test_env["orchestrator"]
    platform_repo = test_env["platform_repo"]
    task_repo = test_env["task_repo"]
    slack_mock = test_env["slack_mock"]

    # 1. Authorize user as lead operator
    platform_repo.assign_reviewer_role(
        platform=PlatformType.SLACK,
        user_id="U_AUTHORIZED_LEAD",
        role="lead",
        assigned_by="admin",
    )

    # 2. Create task and advance to AWAITING_HUMAN_APPROVAL with verified evidence
    from app.models.task import TaskCreate, EvidenceCreate, TransitionRequest
    from app.core.state_machine import CallerType, TaskStatus
    task = task_repo.create_task(
        TaskCreate(title="Test approval", description="desc", reported_by="test")
    )
    # Triage -> Reproducing
    task_repo.record_transition(task.id, TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.AGENT, actor_id="agent_1"))
    task_repo.record_transition(task.id, TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.AGENT, actor_id="agent_1"))
    # Repro evidence (exit 1) -> Reproduced
    ev1 = task_repo.add_evidence(task.id, EvidenceCreate(stage="reproduction", command_executed="pytest", exit_code=1))
    task_repo.record_transition(task.id, TransitionRequest(target_status=TaskStatus.REPRODUCED, actor_type=CallerType.AGENT, actor_id="agent_1", evidence_id=ev1.id))
    # Fix proposed -> Verifying
    task_repo.record_transition(task.id, TransitionRequest(target_status=TaskStatus.FIX_PROPOSED, actor_type=CallerType.AGENT, actor_id="agent_1"))
    task_repo.record_transition(task.id, TransitionRequest(target_status=TaskStatus.VERIFYING, actor_type=CallerType.AGENT, actor_id="agent_1"))
    # Verify evidence (exit 0 + patch diff) -> Awaiting human approval
    ev2 = task_repo.add_evidence(
        task.id,
        EvidenceCreate(
            stage="verification",
            command_executed="pytest",
            exit_code=0,
            patch_diff="--- a/calculator.py\n+++ b/calculator.py\n@@ -22,1 +22,1 @@\n- return price + surcharge\n+ return price - discount",
        ),
    )
    task_repo.record_transition(task.id, TransitionRequest(target_status=TaskStatus.AWAITING_HUMAN_APPROVAL, actor_type=CallerType.AGENT, actor_id="agent_1", evidence_id=ev2.id))

    # 3. Authorized reviewer clicks Approve & Ship
    approve_event = ChatEvent(
        event_id="act_btn_02",
        platform=PlatformType.SLACK,
        conversation_id="C_ENG_CHANNEL",
        thread_id="171000.999",
        user_id="U_AUTHORIZED_LEAD",
        user_display_name="Jordan Lead",
        message_text="Approve",
        mention_type=MentionType.ACTION,
        action_id="approve_task",
        action_value=task.id,
    )

    res = orc.handle_review_action(approve_event)
    assert res["status"] == "approved"

    # Task transitions to COMPLETED in database
    final_task = task_repo.get_task(task.id)
    assert final_task.status == TaskStatus.COMPLETED

    # Confirmation sent to chat
    assert any("Task Approved & Shipped!" in m.text for m in slack_mock.outbound_messages)


def test_authorized_user_rejects_task_initiating_revision(test_env):
    orc = test_env["orchestrator"]
    platform_repo = test_env["platform_repo"]
    task_repo = test_env["task_repo"]
    slack_mock = test_env["slack_mock"]

    platform_repo.assign_reviewer_role(
        platform=PlatformType.SLACK,
        user_id="U_AUTHORIZED_LEAD",
        role="lead",
    )

    # Setup task at AWAITING_HUMAN_APPROVAL
    from app.models.task import TaskCreate, EvidenceCreate, TransitionRequest
    from app.core.state_machine import CallerType, TaskStatus
    task = task_repo.create_task(TaskCreate(title="Test reject", description="desc", reported_by="test"))
    task_repo.record_transition(task.id, TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.AGENT, actor_id="agent_1"))
    task_repo.record_transition(task.id, TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.AGENT, actor_id="agent_1"))
    ev1 = task_repo.add_evidence(task.id, EvidenceCreate(stage="reproduction", command_executed="pytest", exit_code=1))
    task_repo.record_transition(task.id, TransitionRequest(target_status=TaskStatus.REPRODUCED, actor_type=CallerType.AGENT, actor_id="agent_1", evidence_id=ev1.id))
    task_repo.record_transition(task.id, TransitionRequest(target_status=TaskStatus.FIX_PROPOSED, actor_type=CallerType.AGENT, actor_id="agent_1"))
    task_repo.record_transition(task.id, TransitionRequest(target_status=TaskStatus.VERIFYING, actor_type=CallerType.AGENT, actor_id="agent_1"))
    ev2 = task_repo.add_evidence(
        task.id,
        EvidenceCreate(
            stage="verification",
            command_executed="pytest",
            exit_code=0,
            patch_diff="--- a/calculator.py\n+++ b/calculator.py\n@@ -22,1 +22,1 @@\n- return price + surcharge\n+ return price - discount",
        ),
    )
    task_repo.record_transition(task.id, TransitionRequest(target_status=TaskStatus.AWAITING_HUMAN_APPROVAL, actor_type=CallerType.AGENT, actor_id="agent_1", evidence_id=ev2.id))

    # Reviewer clicks Request Changes
    reject_event = ChatEvent(
        event_id="act_btn_03",
        platform=PlatformType.SLACK,
        conversation_id="C_ENG_CHANNEL",
        thread_id="171000.999",
        user_id="U_AUTHORIZED_LEAD",
        message_text="Reject",
        mention_type=MentionType.ACTION,
        action_id="reject_task",
        action_value=task.id,
    )

    res = orc.handle_review_action(reject_event)
    assert res["status"] == "revision_requested"

    # Task returns to FIX_PROPOSED for agent revision
    reloaded = task_repo.get_task(task.id)
    assert reloaded.status == TaskStatus.FIX_PROPOSED

    # Revision message sent to chat
    assert any("Revision Requested" in m.text for m in slack_mock.outbound_messages)
