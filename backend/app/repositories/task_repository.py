"""Task and Evidence SQLite repository implementing persistence and atomic state transitions."""

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import sqlite3

from app.core.state_machine import (
    CallerType,
    InvalidStateTransitionError,
    TaskStatus,
    validate_transition,
)
from app.db.session import get_connection
from app.models.task import (
    ApprovalRecordResponse,
    ApprovalRequest,
    EvidenceCreate,
    EvidenceResponse,
    RejectionRequest,
    TaskCreate,
    TaskResponse,
    TransitionRequest,
    TransitionResponse,
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class TaskNotFoundError(Exception):
    """Raised when a requested task ID is not found in the database."""
    pass


class TaskRepository:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def create_task(self, data: TaskCreate) -> TaskResponse:
        """Create and persist a new task in REPORTED status."""
        task_id = f"task_{uuid.uuid4().hex}"
        now = _utc_now()
        initial_status = TaskStatus.REPORTED.value

        query = """
        INSERT INTO tasks (
            id, title, description, reported_by, input_source, status,
            repository_url, branch_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    query,
                    (
                        task_id,
                        data.title,
                        data.description,
                        data.reported_by,
                        data.input_source,
                        initial_status,
                        data.repository_url,
                        data.branch_name,
                        now,
                        now,
                    ),
                )

        return self.get_task(task_id)

    def get_task(self, task_id: str) -> TaskResponse:
        """Retrieve a task by ID. Raises TaskNotFoundError if not found."""
        query = "SELECT * FROM tasks WHERE id = ?;"
        with get_connection(self.db_path) as conn:
            row = conn.execute(query, (task_id,)).fetchone()
            if not row:
                raise TaskNotFoundError(f"Task '{task_id}' not found.")
            return TaskResponse(
                id=row["id"],
                title=row["title"],
                description=row["description"],
                reported_by=row["reported_by"],
                input_source=row["input_source"],
                status=TaskStatus(row["status"]),
                repository_url=row["repository_url"],
                branch_name=row["branch_name"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    def list_tasks(self, status: Optional[TaskStatus] = None) -> List[TaskResponse]:
        """List tasks, optionally filtered by workflow status."""
        query = "SELECT * FROM tasks"
        params = ()
        if status:
            query += " WHERE status = ?"
            params = (status.value,)
        query += " ORDER BY created_at DESC;"

        with get_connection(self.db_path) as conn:
            rows = conn.execute(query, params).fetchall()
            return [
                TaskResponse(
                    id=row["id"],
                    title=row["title"],
                    description=row["description"],
                    reported_by=row["reported_by"],
                    input_source=row["input_source"],
                    status=TaskStatus(row["status"]),
                    repository_url=row["repository_url"],
                    branch_name=row["branch_name"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                for row in rows
            ]

    def add_evidence(self, task_id: str, data: EvidenceCreate) -> EvidenceResponse:
        """Attach verified execution or reproduction evidence to a task."""
        # Ensure task exists
        self.get_task(task_id)

        evidence_id = f"ev_{uuid.uuid4().hex}"
        now = _utc_now()
        meta_json = json.dumps(data.metadata) if data.metadata else None

        query = """
        INSERT INTO evidence (
            id, task_id, stage, command_executed, exit_code, stdout,
            stderr, patch_diff, metadata_json, is_mock, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    query,
                    (
                        evidence_id,
                        task_id,
                        data.stage,
                        data.command_executed,
                        data.exit_code,
                        data.stdout,
                        data.stderr,
                        data.patch_diff,
                        meta_json,
                        1 if data.is_mock else 0,
                        now,
                    ),
                )

        return self.get_evidence_by_id(evidence_id)

    def get_evidence_by_id(self, evidence_id: str) -> Optional[EvidenceResponse]:
        """Retrieve an evidence artifact by ID."""
        query = "SELECT * FROM evidence WHERE id = ?;"
        with get_connection(self.db_path) as conn:
            row = conn.execute(query, (evidence_id,)).fetchone()
            if not row:
                return None
            return EvidenceResponse(
                id=row["id"],
                task_id=row["task_id"],
                stage=row["stage"],
                command_executed=row["command_executed"],
                exit_code=row["exit_code"],
                stdout=row["stdout"],
                stderr=row["stderr"],
                patch_diff=row["patch_diff"],
                metadata_json=row["metadata_json"],
                is_mock=bool(row["is_mock"]),
                recorded_at=row["recorded_at"],
            )

    def list_evidence_for_task(self, task_id: str) -> List[EvidenceResponse]:
        """Retrieve all evidence artifacts associated with a task."""
        query = "SELECT * FROM evidence WHERE task_id = ? ORDER BY recorded_at ASC;"
        with get_connection(self.db_path) as conn:
            rows = conn.execute(query, (task_id,)).fetchall()
            return [
                EvidenceResponse(
                    id=row["id"],
                    task_id=row["task_id"],
                    stage=row["stage"],
                    command_executed=row["command_executed"],
                    exit_code=row["exit_code"],
                    stdout=row["stdout"],
                    stderr=row["stderr"],
                    patch_diff=row["patch_diff"],
                    metadata_json=row["metadata_json"],
                    is_mock=bool(row["is_mock"]),
                    recorded_at=row["recorded_at"],
                )
                for row in rows
            ]

    def record_transition(
        self,
        task_id: str,
        data: TransitionRequest,
        custom_evidence: Optional[Dict[str, Any]] = None,
    ) -> TransitionResponse:
        """Validate and execute an atomic state transition with audit logging."""
        task = self.get_task(task_id)
        current_status = task.status
        target_status = data.target_status

        # Prepare evidence dict for state machine validation
        evidence_dict = custom_evidence
        if not evidence_dict and data.evidence_id:
            ev = self.get_evidence_by_id(data.evidence_id)
            if ev:
                evidence_dict = {
                    "command_executed": ev.command_executed,
                    "exit_code": ev.exit_code,
                    "patch_diff": ev.patch_diff,
                    "is_mock": ev.is_mock,
                }

        # Validate business and security rules
        validate_transition(
            current_status=current_status,
            target_status=target_status,
            caller_type=data.actor_type,
            evidence=evidence_dict,
        )

        transition_id = f"tr_{uuid.uuid4().hex}"
        now = _utc_now()

        # Atomic database transaction: update task status + record audit log
        update_task_query = "UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?;"
        insert_trans_query = """
        INSERT INTO task_transitions (
            id, task_id, from_status, to_status, actor_type, actor_id, reason, evidence_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
        """

        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(update_task_query, (target_status.value, now, task_id))
                conn.execute(
                    insert_trans_query,
                    (
                        transition_id,
                        task_id,
                        current_status.value,
                        target_status.value,
                        data.actor_type.value,
                        data.actor_id,
                        data.reason,
                        data.evidence_id,
                        now,
                    ),
                )

        return TransitionResponse(
            id=transition_id,
            task_id=task_id,
            from_status=current_status,
            to_status=target_status,
            actor_type=data.actor_type,
            actor_id=data.actor_id,
            reason=data.reason,
            evidence_id=data.evidence_id,
            created_at=now,
        )

    def record_human_approval(
        self,
        task_id: str,
        approval_req: ApprovalRequest,
        actor_type: CallerType = CallerType.HUMAN,
    ) -> TaskResponse:
        """Execute human approval for a task currently awaiting approval."""
        transition_req = TransitionRequest(
            target_status=TaskStatus.APPROVED,
            actor_type=actor_type,
            actor_id=approval_req.reviewer_id,
            reason=approval_req.comments or "Human approved proposed fix",
        )
        self.record_transition(task_id, transition_req)

        # Record in approval_records table
        appr_id = f"appr_{uuid.uuid4().hex}"
        now = _utc_now()
        insert_appr_query = """
        INSERT INTO approval_records (id, task_id, decision, reviewer_id, feedback, decided_at)
        VALUES (?, ?, ?, ?, ?, ?);
        """
        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    insert_appr_query,
                    (appr_id, task_id, "approved", approval_req.reviewer_id, approval_req.comments, now),
                )

        return self.get_task(task_id)

    def record_human_rejection(
        self,
        task_id: str,
        rejection_req: RejectionRequest,
        actor_type: CallerType = CallerType.HUMAN,
    ) -> TaskResponse:
        """Execute human rejection with feedback and target return state."""
        transition_req = TransitionRequest(
            target_status=TaskStatus.REJECTED,
            actor_type=actor_type,
            actor_id=rejection_req.reviewer_id,
            reason=rejection_req.feedback,
        )
        self.record_transition(task_id, transition_req)

        # Record in approval_records table
        appr_id = f"appr_{uuid.uuid4().hex}"
        now = _utc_now()
        insert_appr_query = """
        INSERT INTO approval_records (id, task_id, decision, reviewer_id, feedback, decided_at)
        VALUES (?, ?, ?, ?, ?, ?);
        """
        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    insert_appr_query,
                    (appr_id, task_id, "rejected", rejection_req.reviewer_id, rejection_req.feedback, now),
                )

        # If requested return_to is FIX_PROPOSED, transition from REJECTED -> FIX_PROPOSED
        if rejection_req.return_to == TaskStatus.FIX_PROPOSED:
            self.record_transition(
                task_id,
                TransitionRequest(
                    target_status=TaskStatus.FIX_PROPOSED,
                    actor_type=CallerType.AGENT,
                    actor_id="system",
                    reason=f"Returned to FIX_PROPOSED following human rejection: {rejection_req.feedback}",
                ),
            )

        return self.get_task(task_id)

    def get_transitions_for_task(self, task_id: str) -> List[TransitionResponse]:
        """Retrieve chronological immutable transition history for a task."""
        query = "SELECT * FROM task_transitions WHERE task_id = ? ORDER BY created_at ASC;"
        with get_connection(self.db_path) as conn:
            rows = conn.execute(query, (task_id,)).fetchall()
            return [
                TransitionResponse(
                    id=row["id"],
                    task_id=row["task_id"],
                    from_status=TaskStatus(row["from_status"]),
                    to_status=TaskStatus(row["to_status"]),
                    actor_type=CallerType(row["actor_type"]),
                    actor_id=row["actor_id"],
                    reason=row["reason"],
                    evidence_id=row["evidence_id"],
                    created_at=row["created_at"],
                )
                for row in rows
            ]

    def get_approval_records_for_task(self, task_id: str) -> List[ApprovalRecordResponse]:
        """Retrieve approval and rejection records for a task."""
        query = "SELECT * FROM approval_records WHERE task_id = ? ORDER BY decided_at ASC;"
        with get_connection(self.db_path) as conn:
            rows = conn.execute(query, (task_id,)).fetchall()
            return [
                ApprovalRecordResponse(
                    id=row["id"],
                    task_id=row["task_id"],
                    decision=row["decision"],
                    reviewer_id=row["reviewer_id"],
                    feedback=row["feedback"],
                    decided_at=row["decided_at"],
                )
                for row in rows
            ]

