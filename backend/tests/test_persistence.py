"""Integration tests for SQLite persistence, repositories, and transactional state updates."""

import pytest
from app.core.state_machine import (
    CallerType,
    InvalidStateTransitionError,
    MissingEvidenceError,
    TaskStatus,
    UnauthorizedTransitionError,
)
from app.db.session import init_db
from app.models.task import (
    ApprovalRequest,
    EvidenceCreate,
    RejectionRequest,
    TaskCreate,
    TransitionRequest,
)
from app.repositories.task_repository import TaskNotFoundError, TaskRepository


@pytest.fixture
def repo(tmp_path):
    """Provide a fresh TaskRepository backed by an isolated temporary SQLite database."""
    db_file = str(tmp_path / "test_shipdev.db")
    init_db(db_file)
    return TaskRepository(db_path=db_file)


def test_database_initialization(repo):
    """Verify that database schema initializes properly and creates an empty task list."""
    tasks = repo.list_tasks()
    assert tasks == []


def test_create_and_retrieve_task(repo):
    """Verify task creation with metadata and default REPORTED status."""
    task_in = TaskCreate(
        title="Voice dictation bug",
        description="Wispr Flow input dropped trailing punctuation",
        reported_by="ayush",
        input_source="wispr_flow",
    )
    created = repo.create_task(task_in)

    assert created.id.startswith("task_")
    assert created.title == "Voice dictation bug"
    assert created.status == TaskStatus.REPORTED
    assert created.input_source == "wispr_flow"

    fetched = repo.get_task(created.id)
    assert fetched.id == created.id
    assert fetched.description == task_in.description


def test_task_state_transition_persistence(repo):
    """Verify state update and immutable audit log entry."""
    task = repo.create_task(
        TaskCreate(title="Test Task", description="Desc", reported_by="ayush")
    )

    transition_req = TransitionRequest(
        target_status=TaskStatus.TRIAGED,
        actor_type=CallerType.AGENT,
        actor_id="switch-triage-agent",
        reason="Bug classified under frontend auth",
    )
    res = repo.record_transition(task.id, transition_req)

    assert res.from_status == TaskStatus.REPORTED
    assert res.to_status == TaskStatus.TRIAGED

    # Verify task updated
    updated_task = repo.get_task(task.id)
    assert updated_task.status == TaskStatus.TRIAGED

    # Verify transition audit history
    history = repo.get_transitions_for_task(task.id)
    assert len(history) == 1
    assert history[0].actor_id == "switch-triage-agent"
    assert history[0].from_status == TaskStatus.REPORTED
    assert history[0].to_status == TaskStatus.TRIAGED


def test_evidence_persistence_and_association(repo):
    """Verify storing reproduction evidence and advancing state with evidence link."""
    task = repo.create_task(
        TaskCreate(title="Test Task", description="Desc", reported_by="ayush")
    )

    # Move to REPRODUCING
    repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.TRIAGED,
            actor_type=CallerType.AGENT,
            actor_id="triage-agent",
        ),
    )
    repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCING,
            actor_type=CallerType.AGENT,
            actor_id="repro-agent",
        ),
    )

    # Attach real reproduction evidence
    ev_data = EvidenceCreate(
        stage="reproduction",
        command_executed="pytest tests/repro.py",
        exit_code=1,
        stdout="AssertionError: Token expired",
        is_mock=False,
    )
    evidence = repo.add_evidence(task.id, ev_data)
    assert evidence.id.startswith("ev_")
    assert evidence.exit_code == 1

    # Transition to REPRODUCED using evidence_id
    res = repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCED,
            actor_type=CallerType.AGENT,
            actor_id="repro-agent",
            evidence_id=evidence.id,
        ),
    )
    assert res.to_status == TaskStatus.REPRODUCED

    # Verify evidence can be listed
    ev_list = repo.list_evidence_for_task(task.id)
    assert len(ev_list) == 1
    assert ev_list[0].command_executed == "pytest tests/repro.py"


def test_transaction_rollback_on_invalid_transition(repo):
    """Verify that an invalid transition fails atomically without modifying state."""
    task = repo.create_task(
        TaskCreate(title="Test Task", description="Desc", reported_by="ayush")
    )

    # Try invalid jump: REPORTED -> APPROVED
    with pytest.raises(InvalidStateTransitionError):
        repo.record_transition(
            task.id,
            TransitionRequest(
                target_status=TaskStatus.APPROVED,
                actor_type=CallerType.HUMAN,
                actor_id="ayush",
            ),
        )

    # Verify task status is unchanged
    refetched = repo.get_task(task.id)
    assert refetched.status == TaskStatus.REPORTED

    # Verify 0 transitions recorded
    history = repo.get_transitions_for_task(task.id)
    assert len(history) == 0


def test_human_approval_persistence_and_agent_rejection(repo):
    """Verify human approval succeeds and agent approval attempt is rejected."""
    task = repo.create_task(
        TaskCreate(title="Test Task", description="Desc", reported_by="ayush")
    )

    # Progress to AWAITING_HUMAN_APPROVAL
    repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.AGENT, actor_id="a1"),
    )
    repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.AGENT, actor_id="a1"),
    )
    repro_ev = repo.add_evidence(
        task.id,
        EvidenceCreate(stage="reproduction", command_executed="pytest repro.py", exit_code=1, is_mock=False),
    )
    repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCED,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=repro_ev.id,
        ),
    )
    repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.FIX_PROPOSED, actor_type=CallerType.AGENT, actor_id="a1"),
    )
    repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.VERIFYING, actor_type=CallerType.AGENT, actor_id="a1"),
    )

    verify_ev = repo.add_evidence(
        task.id,
        EvidenceCreate(
            stage="verification",
            command_executed="pytest tests/",
            exit_code=0,
            patch_diff="--- a\n+++ b",
            is_mock=False,
        ),
    )
    repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.AWAITING_HUMAN_APPROVAL,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=verify_ev.id,
        ),
    )

    # 1. Agent attempts approval -> Security Violation
    with pytest.raises(UnauthorizedTransitionError):
        repo.record_human_approval(
            task.id,
            ApprovalRequest(reviewer_id="rogue-agent", comments="Auto approved"),
            actor_type=CallerType.AGENT,
        )

    # Verify task still awaiting approval
    assert repo.get_task(task.id).status == TaskStatus.AWAITING_HUMAN_APPROVAL

    # 2. Human approves -> Success
    approved_task = repo.record_human_approval(
        task.id,
        ApprovalRequest(reviewer_id="ayush", comments="Verified reproduction and fix diff. Ready to ship."),
        actor_type=CallerType.HUMAN,
    )
    assert approved_task.status == TaskStatus.APPROVED

    # Check approval record in DB
    appr_records = repo.get_approval_records_for_task(task.id)
    assert len(appr_records) == 1
    assert appr_records[0].decision == "approved"
    assert appr_records[0].reviewer_id == "ayush"


def test_human_rejection_flow(repo):
    """Verify human rejection records feedback and returns task to FIX_PROPOSED."""
    task = repo.create_task(
        TaskCreate(title="Test Task", description="Desc", reported_by="ayush")
    )

    # Progress to AWAITING_HUMAN_APPROVAL
    repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.AGENT, actor_id="a1"),
    )
    repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.AGENT, actor_id="a1"),
    )
    repro_ev = repo.add_evidence(
        task.id,
        EvidenceCreate(stage="reproduction", command_executed="pytest repro.py", exit_code=1, is_mock=False),
    )
    repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCED,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=repro_ev.id,
        ),
    )
    repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.FIX_PROPOSED, actor_type=CallerType.AGENT, actor_id="a1"),
    )
    repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.VERIFYING, actor_type=CallerType.AGENT, actor_id="a1"),
    )
    verify_ev = repo.add_evidence(
        task.id,
        EvidenceCreate(
            stage="verification",
            command_executed="pytest tests/",
            exit_code=0,
            patch_diff="--- a\n+++ b",
            is_mock=False,
        ),
    )
    repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.AWAITING_HUMAN_APPROVAL,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=verify_ev.id,
        ),
    )

    # Human rejects with feedback
    rejected_task = repo.record_human_rejection(
        task.id,
        RejectionRequest(
            reviewer_id="ayush",
            feedback="Patch causes memory leak in background worker",
            return_to=TaskStatus.FIX_PROPOSED,
        ),
        actor_type=CallerType.HUMAN,
    )

    # Task was bounced back to FIX_PROPOSED
    assert rejected_task.status == TaskStatus.FIX_PROPOSED

    # Check rejection record
    appr_records = repo.get_approval_records_for_task(task.id)
    assert len(appr_records) == 1
    assert appr_records[0].decision == "rejected"
    assert "memory leak" in appr_records[0].feedback

