"""Unit tests for the ShipDev workflow state machine and security invariants."""

import pytest
from app.core.state_machine import (
    CallerType,
    InvalidStateTransitionError,
    MissingEvidenceError,
    TaskStatus,
    UnauthorizedTransitionError,
    validate_transition,
)


def test_complete_happy_path_lifecycle():
    """Verify standard progression from REPORTED to COMPLETED."""
    # 1. Triage by agent
    validate_transition(TaskStatus.REPORTED, TaskStatus.TRIAGED, CallerType.AGENT)

    # 2. Reproduction start by agent
    validate_transition(TaskStatus.TRIAGED, TaskStatus.REPRODUCING, CallerType.AGENT)

    # 3. Bug reproduced with real failure evidence
    repro_evidence = {
        "command_executed": "pytest tests/repro_bug.py",
        "exit_code": 1,
        "is_mock": False,
    }
    validate_transition(
        TaskStatus.REPRODUCING,
        TaskStatus.REPRODUCED,
        CallerType.AGENT,
        evidence=repro_evidence,
    )

    # 4. Fix proposed by agent
    validate_transition(TaskStatus.REPRODUCED, TaskStatus.FIX_PROPOSED, CallerType.AGENT)

    # 5. Verification started by agent
    validate_transition(TaskStatus.FIX_PROPOSED, TaskStatus.VERIFYING, CallerType.AGENT)

    # 6. Verification completed with passing test & patch evidence
    verify_evidence = {
        "command_executed": "pytest tests/",
        "exit_code": 0,
        "patch_diff": "--- a/auth.py\n+++ b/auth.py\n@@ -1,1 +1,1 @@",
        "is_mock": False,
    }
    validate_transition(
        TaskStatus.VERIFYING,
        TaskStatus.AWAITING_HUMAN_APPROVAL,
        CallerType.AGENT,
        evidence=verify_evidence,
    )

    # 7. Human approves
    validate_transition(
        TaskStatus.AWAITING_HUMAN_APPROVAL,
        TaskStatus.APPROVED,
        CallerType.HUMAN,
    )

    # 8. Human marks completed
    validate_transition(TaskStatus.APPROVED, TaskStatus.COMPLETED, CallerType.HUMAN)


def test_agent_cannot_approve_tasks():
    """Security Invariant: AI agents must never be permitted to approve tasks."""
    with pytest.raises(UnauthorizedTransitionError) as exc_info:
        validate_transition(
            TaskStatus.AWAITING_HUMAN_APPROVAL,
            TaskStatus.APPROVED,
            CallerType.AGENT,
        )
    assert "human authorization" in str(exc_info.value).lower()


def test_agent_cannot_complete_tasks():
    """Security Invariant: AI agents must never be permitted to mark tasks completed."""
    with pytest.raises(UnauthorizedTransitionError) as exc_info:
        validate_transition(
            TaskStatus.APPROVED,
            TaskStatus.COMPLETED,
            CallerType.AGENT,
        )
    assert "human authorization" in str(exc_info.value).lower()


def test_invalid_state_skips_are_rejected():
    """State Machine Invariant: Arbitrary state jumping is forbidden."""
    # Attempt jumping from REPORTED directly to APPROVED
    with pytest.raises(InvalidStateTransitionError):
        validate_transition(TaskStatus.REPORTED, TaskStatus.APPROVED, CallerType.HUMAN)

    # Attempt jumping from REPRODUCING directly to FIX_PROPOSED
    with pytest.raises(InvalidStateTransitionError):
        validate_transition(TaskStatus.REPRODUCING, TaskStatus.FIX_PROPOSED, CallerType.AGENT)


def test_terminal_state_transitions_are_rejected():
    """State Machine Invariant: No transitions are permitted from COMPLETED or FAILED."""
    with pytest.raises(InvalidStateTransitionError) as exc_info:
        validate_transition(TaskStatus.COMPLETED, TaskStatus.REPORTED, CallerType.HUMAN)
    assert "terminal state" in str(exc_info.value).lower()

    with pytest.raises(InvalidStateTransitionError) as exc_info:
        validate_transition(TaskStatus.FAILED, TaskStatus.TRIAGED, CallerType.HUMAN)
    assert "terminal state" in str(exc_info.value).lower()


def test_reproduction_evidence_is_mandatory():
    """Evidence Invariant: REPRODUCING -> REPRODUCED requires valid execution evidence."""
    # 1. Missing evidence entirely
    with pytest.raises(MissingEvidenceError):
        validate_transition(TaskStatus.REPRODUCING, TaskStatus.REPRODUCED, CallerType.AGENT)

    # 2. Mock evidence rejected
    mock_evidence = {
        "command_executed": "pytest repro.py",
        "exit_code": 1,
        "is_mock": True,
    }
    with pytest.raises(MissingEvidenceError) as exc_info:
        validate_transition(
            TaskStatus.REPRODUCING,
            TaskStatus.REPRODUCED,
            CallerType.AGENT,
            evidence=mock_evidence,
        )
    assert "mock evidence" in str(exc_info.value).lower()

    # 3. Missing command_executed
    incomplete_evidence = {"exit_code": 1, "is_mock": False}
    with pytest.raises(MissingEvidenceError):
        validate_transition(
            TaskStatus.REPRODUCING,
            TaskStatus.REPRODUCED,
            CallerType.AGENT,
            evidence=incomplete_evidence,
        )


def test_verification_evidence_is_mandatory():
    """Evidence Invariant: VERIFYING -> AWAITING_HUMAN_APPROVAL requires clean tests and diff."""
    # 1. Missing evidence entirely
    with pytest.raises(MissingEvidenceError):
        validate_transition(
            TaskStatus.VERIFYING,
            TaskStatus.AWAITING_HUMAN_APPROVAL,
            CallerType.AGENT,
        )

    # 2. Mock evidence rejected
    mock_evidence = {
        "command_executed": "pytest",
        "exit_code": 0,
        "patch_diff": "+ fix",
        "is_mock": True,
    }
    with pytest.raises(MissingEvidenceError) as exc_info:
        validate_transition(
            TaskStatus.VERIFYING,
            TaskStatus.AWAITING_HUMAN_APPROVAL,
            CallerType.AGENT,
            evidence=mock_evidence,
        )
    assert "mock evidence" in str(exc_info.value).lower()

    # 3. Verification tests failed (non-zero exit code)
    failing_tests_evidence = {
        "command_executed": "pytest",
        "exit_code": 1,
        "patch_diff": "+ fix",
        "is_mock": False,
    }
    with pytest.raises(MissingEvidenceError) as exc_info:
        validate_transition(
            TaskStatus.VERIFYING,
            TaskStatus.AWAITING_HUMAN_APPROVAL,
            CallerType.AGENT,
            evidence=failing_tests_evidence,
        )
    assert "exit with code 0" in str(exc_info.value).lower()


def test_failure_and_recovery_paths():
    """Verify that failure and rejection states allow recovery loops."""
    # Triage failure
    validate_transition(TaskStatus.REPORTED, TaskStatus.TRIAGE_FAILED, CallerType.AGENT)

    # Reproduction failure
    validate_transition(TaskStatus.REPRODUCING, TaskStatus.REPRODUCTION_FAILED, CallerType.AGENT)

    # Verification failure -> fix re-attempt
    validate_transition(TaskStatus.VERIFYING, TaskStatus.VERIFICATION_FAILED, CallerType.AGENT)
    validate_transition(TaskStatus.VERIFICATION_FAILED, TaskStatus.FIX_PROPOSED, CallerType.AGENT)

    # Human rejection -> fix re-attempt
    validate_transition(TaskStatus.AWAITING_HUMAN_APPROVAL, TaskStatus.REJECTED, CallerType.HUMAN)
    validate_transition(TaskStatus.REJECTED, TaskStatus.FIX_PROPOSED, CallerType.AGENT)

    # Human terminal rejection -> FAILED
    validate_transition(TaskStatus.REJECTED, TaskStatus.FAILED, CallerType.HUMAN)


def test_human_emergency_abort_allowed_from_active_states():
    """Verify human can cancel/abort a task to FAILED from any active state."""
    validate_transition(TaskStatus.REPORTED, TaskStatus.FAILED, CallerType.HUMAN)
    validate_transition(TaskStatus.REPRODUCING, TaskStatus.FAILED, CallerType.HUMAN)
    validate_transition(TaskStatus.VERIFYING, TaskStatus.FAILED, CallerType.HUMAN)

    # Agent cannot emergency abort
    with pytest.raises(UnauthorizedTransitionError):
        validate_transition(TaskStatus.VERIFYING, TaskStatus.FAILED, CallerType.AGENT)

