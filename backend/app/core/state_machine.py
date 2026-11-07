"""Workflow state machine, transition validator, and security gate rules for ShipDev."""

from enum import Enum
from typing import Any, Dict, Optional, Set, Tuple


class TaskStatus(str, Enum):
    # Primary forward workflow states
    REPORTED = "REPORTED"
    TRIAGED = "TRIAGED"
    REPRODUCING = "REPRODUCING"
    REPRODUCED = "REPRODUCED"
    FIX_PROPOSED = "FIX_PROPOSED"
    VERIFYING = "VERIFYING"
    AWAITING_HUMAN_APPROVAL = "AWAITING_HUMAN_APPROVAL"
    APPROVED = "APPROVED"
    COMPLETED = "COMPLETED"

    # Meaningful failure and rejection states
    TRIAGE_FAILED = "TRIAGE_FAILED"
    REPRODUCTION_FAILED = "REPRODUCTION_FAILED"
    VERIFICATION_FAILED = "VERIFICATION_FAILED"
    REJECTED = "REJECTED"
    FAILED = "FAILED"


class CallerType(str, Enum):
    HUMAN = "human"
    AGENT = "agent"


class StateMachineError(Exception):
    """Base exception for workflow state machine errors."""
    pass


class InvalidStateTransitionError(StateMachineError):
    """Raised when attempting an undefined or invalid state transition."""
    pass


class UnauthorizedTransitionError(StateMachineError):
    """Raised when an actor lacks permission for a transition (e.g. agent attempting approval)."""
    pass


class MissingEvidenceError(StateMachineError):
    """Raised when a state transition lacks mandatory verified execution evidence."""
    pass


# Transitions permitted exclusively for HUMAN callers
HUMAN_ONLY_TARGET_STATES: Set[TaskStatus] = {
    TaskStatus.APPROVED,
    TaskStatus.COMPLETED,
}

# Terminal states from which no further transitions are allowed
TERMINAL_STATES: Set[TaskStatus] = {
    TaskStatus.COMPLETED,
    TaskStatus.FAILED,
}

# Valid transition matrix: (current_status, target_status) -> allowed caller types
VALID_TRANSITIONS: Dict[Tuple[TaskStatus, TaskStatus], Set[CallerType]] = {
    # 1. Triage phase
    (TaskStatus.REPORTED, TaskStatus.TRIAGED): {CallerType.AGENT, CallerType.HUMAN},
    (TaskStatus.REPORTED, TaskStatus.TRIAGE_FAILED): {CallerType.AGENT, CallerType.HUMAN},

    # 2. Reproduction phase
    (TaskStatus.TRIAGED, TaskStatus.REPRODUCING): {CallerType.AGENT, CallerType.HUMAN},
    (TaskStatus.REPRODUCING, TaskStatus.REPRODUCED): {CallerType.AGENT, CallerType.HUMAN},
    (TaskStatus.REPRODUCING, TaskStatus.REPRODUCTION_FAILED): {CallerType.AGENT, CallerType.HUMAN},

    # 3. Fix proposal phase
    (TaskStatus.REPRODUCED, TaskStatus.FIX_PROPOSED): {CallerType.AGENT, CallerType.HUMAN},
    (TaskStatus.VERIFICATION_FAILED, TaskStatus.FIX_PROPOSED): {CallerType.AGENT, CallerType.HUMAN},
    (TaskStatus.REJECTED, TaskStatus.FIX_PROPOSED): {CallerType.AGENT, CallerType.HUMAN},

    # 4. Verification phase
    (TaskStatus.FIX_PROPOSED, TaskStatus.VERIFYING): {CallerType.AGENT, CallerType.HUMAN},
    (TaskStatus.VERIFYING, TaskStatus.AWAITING_HUMAN_APPROVAL): {CallerType.AGENT, CallerType.HUMAN},
    (TaskStatus.VERIFYING, TaskStatus.VERIFICATION_FAILED): {CallerType.AGENT, CallerType.HUMAN},

    # 5. Human Approval Phase (Strictly Human-Only for APPROVAL / COMPLETION)
    (TaskStatus.AWAITING_HUMAN_APPROVAL, TaskStatus.APPROVED): {CallerType.HUMAN},
    (TaskStatus.AWAITING_HUMAN_APPROVAL, TaskStatus.REJECTED): {CallerType.HUMAN},
    (TaskStatus.REJECTED, TaskStatus.FAILED): {CallerType.HUMAN},
    (TaskStatus.APPROVED, TaskStatus.COMPLETED): {CallerType.HUMAN},

    # 6. Human Emergency Abort from any active non-terminal state
    (TaskStatus.REPORTED, TaskStatus.FAILED): {CallerType.HUMAN},
    (TaskStatus.TRIAGED, TaskStatus.FAILED): {CallerType.HUMAN},
    (TaskStatus.TRIAGE_FAILED, TaskStatus.FAILED): {CallerType.HUMAN},
    (TaskStatus.REPRODUCING, TaskStatus.FAILED): {CallerType.HUMAN},
    (TaskStatus.REPRODUCTION_FAILED, TaskStatus.FAILED): {CallerType.HUMAN},
    (TaskStatus.REPRODUCED, TaskStatus.FAILED): {CallerType.HUMAN},
    (TaskStatus.FIX_PROPOSED, TaskStatus.FAILED): {CallerType.HUMAN},
    (TaskStatus.VERIFYING, TaskStatus.FAILED): {CallerType.HUMAN},
    (TaskStatus.VERIFICATION_FAILED, TaskStatus.FAILED): {CallerType.HUMAN},
    (TaskStatus.AWAITING_HUMAN_APPROVAL, TaskStatus.FAILED): {CallerType.HUMAN},
}


def validate_transition(
    current_status: TaskStatus,
    target_status: TaskStatus,
    caller_type: CallerType,
    evidence: Optional[Dict[str, Any]] = None,
) -> None:
    """Validate that a proposed state transition satisfies all business and security invariants.

    Raises:
        InvalidStateTransitionError: If the transition path is not in the valid transition matrix.
        UnauthorizedTransitionError: If the caller lacks permission (e.g. agent attempting approval).
        MissingEvidenceError: If required execution evidence is missing or flagged as mock data.
    """
    if current_status in TERMINAL_STATES:
        raise InvalidStateTransitionError(
            f"Cannot transition from terminal state '{current_status.value}'."
        )

    transition_pair = (current_status, target_status)
    if transition_pair not in VALID_TRANSITIONS:
        raise InvalidStateTransitionError(
            f"Invalid transition from '{current_status.value}' to '{target_status.value}'."
        )

    # Invariant: AI agents cannot approve or complete tasks under any circumstances
    if target_status in HUMAN_ONLY_TARGET_STATES and caller_type != CallerType.HUMAN:
        raise UnauthorizedTransitionError(
            f"Security Violation: Transition to '{target_status.value}' requires human authorization."
        )

    allowed_callers = VALID_TRANSITIONS[transition_pair]
    if caller_type not in allowed_callers:
        raise UnauthorizedTransitionError(
            f"Caller of type '{caller_type.value}' is unauthorized for transition "
            f"from '{current_status.value}' to '{target_status.value}'."
        )

    # Invariant: Transitions requiring reproduction evidence
    if target_status == TaskStatus.REPRODUCED:
        _validate_reproduction_evidence(evidence)

    # Invariant: Transitions requiring verification evidence
    if target_status == TaskStatus.AWAITING_HUMAN_APPROVAL:
        _validate_verification_evidence(evidence)


def _validate_reproduction_evidence(evidence: Optional[Dict[str, Any]]) -> None:
    """Verify that reproduction evidence is present, authentic, and non-mock."""
    if not evidence:
        raise MissingEvidenceError(
            "Transition to REPRODUCED requires verified reproduction evidence."
        )
    if evidence.get("is_mock") is True:
        raise MissingEvidenceError(
            "Security Violation: Mock evidence cannot be accepted as real reproduction evidence."
        )
    cmd = evidence.get("command_executed")
    if not cmd or not str(cmd).strip():
        raise MissingEvidenceError(
            "Reproduction evidence must include the executed reproduction command."
        )
    if evidence.get("exit_code") is None:
        raise MissingEvidenceError(
            "Reproduction evidence must include the execution exit code."
        )
    if evidence.get("exit_code") == 0:
        raise MissingEvidenceError(
            "Security Violation: Reproduction evidence must have a non-zero exit code demonstrating failure."
        )


def _validate_verification_evidence(evidence: Optional[Dict[str, Any]]) -> None:
    """Verify that verification evidence includes patch diff, test execution, and clean exit."""
    if not evidence:
        raise MissingEvidenceError(
            "Transition to AWAITING_HUMAN_APPROVAL requires verification evidence."
        )
    if evidence.get("is_mock") is True:
        raise MissingEvidenceError(
            "Security Violation: Mock evidence cannot be accepted as real verification evidence."
        )
    patch_diff = evidence.get("patch_diff")
    if not patch_diff or not str(patch_diff).strip():
        raise MissingEvidenceError(
            "Verification evidence must include the proposed patch diff."
        )
    if evidence.get("exit_code") != 0:
        raise MissingEvidenceError(
            "Verification tests must exit with code 0 before awaiting human approval."
        )
    cmd = evidence.get("command_executed")
    if not cmd or not str(cmd).strip():
        raise MissingEvidenceError(
            "Verification evidence must include the executed test command."
        )
