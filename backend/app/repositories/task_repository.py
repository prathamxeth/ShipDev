"""Task and Evidence SQLite repository implementing persistence and atomic state transitions."""

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import sqlite3

from app.core.events import event_broadcaster
from app.core.state_machine import (
    CallerType,
    InvalidStateTransitionError,
    MissingEvidenceError,
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


class TaskImmutableError(Exception):
    """Raised when attempting to modify or attach evidence to a task in an immutable status (APPROVED, COMPLETED)."""
    pass


class TaskRepository:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    def create_task(
        self,
        data: TaskCreate,
        workspace_id: Optional[str] = None,
        workspace_type: Optional[str] = None,
    ) -> TaskResponse:
        """Create and persist a new task in REPORTED status within a designated workspace."""
        task_id = f"task_{uuid.uuid4().hex}"
        now = _utc_now()
        initial_status = TaskStatus.REPORTED.value
        ws_id = (workspace_id or data.workspace_id or "ws_personal_default").strip()
        ws_type = (workspace_type or data.workspace_type or ("TEAM" if "team" in ws_id.lower() else "PERSONAL")).strip()

        query = """
        INSERT INTO tasks (
            id, title, description, reported_by, input_source, status,
            repository_url, branch_name, workspace_id, workspace_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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
                        ws_id,
                        ws_type,
                        now,
                        now,
                    ),
                )

        return self.get_task(task_id)

    def get_task(self, task_id: str, workspace_id: Optional[str] = None) -> TaskResponse:
        """Retrieve a task by ID, optionally enforcing workspace isolation."""
        query = "SELECT * FROM tasks WHERE id = ?;"
        with get_connection(self.db_path) as conn:
            row = conn.execute(query, (task_id,)).fetchone()
            if not row:
                raise TaskNotFoundError(f"Task '{task_id}' not found.")

            task_ws_id = row["workspace_id"] if "workspace_id" in row.keys() else "ws_personal_default"
            task_ws_type = row["workspace_type"] if "workspace_type" in row.keys() else "PERSONAL"

            if workspace_id and task_ws_id != workspace_id:
                raise TaskNotFoundError(f"Task '{task_id}' not found in workspace '{workspace_id}'.")

            return TaskResponse(
                id=row["id"],
                title=row["title"],
                description=row["description"],
                reported_by=row["reported_by"],
                input_source=row["input_source"],
                status=TaskStatus(row["status"]),
                repository_url=row["repository_url"],
                branch_name=row["branch_name"],
                workspace_id=task_ws_id,
                workspace_type=task_ws_type,
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    def list_tasks(
        self,
        status: Optional[TaskStatus] = None,
        workspace_id: Optional[str] = None,
    ) -> List[TaskResponse]:
        """List tasks, optionally filtered by workflow status and workspace boundary."""
        query = "SELECT * FROM tasks"
        clauses = []
        params = []
        if workspace_id:
            clauses.append("workspace_id = ?")
            params.append(workspace_id.strip())
        if status:
            clauses.append("status = ?")
            params.append(status.value)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at DESC;"

        with get_connection(self.db_path) as conn:
            rows = conn.execute(query, tuple(params)).fetchall()
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
                    workspace_id=row["workspace_id"] if "workspace_id" in row.keys() else "ws_personal_default",
                    workspace_type=row["workspace_type"] if "workspace_type" in row.keys() else "PERSONAL",
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                for row in rows
            ]

    def add_evidence(
        self,
        task_id: str,
        data: EvidenceCreate,
        workspace_id: Optional[str] = None,
    ) -> EvidenceResponse:
        """Attach verified execution or reproduction evidence to a task."""
        # Ensure task exists and validate lifecycle state within authorized workspace
        task = self.get_task(task_id, workspace_id=workspace_id)
        if task.status in {TaskStatus.APPROVED, TaskStatus.COMPLETED}:
            raise TaskImmutableError(
                f"Cannot attach evidence to task '{task_id}'. Task is in '{task.status.value}' status and is immutable."
            )

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

    def list_evidence_for_task(
        self, task_id: str, workspace_id: Optional[str] = None
    ) -> List[EvidenceResponse]:
        """Retrieve all evidence artifacts associated with a task."""
        self.get_task(task_id, workspace_id=workspace_id)
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
        workspace_id: Optional[str] = None,
    ) -> TransitionResponse:
        """Validate and execute an atomic state transition with audit logging and workspace validation."""
        task = self.get_task(task_id, workspace_id=workspace_id)
        current_status = task.status
        target_status = data.target_status

        # Prepare evidence dict for state machine validation
        evidence_dict = custom_evidence
        if data.evidence_id:
            ev = self.get_evidence_by_id(data.evidence_id)
            if not ev:
                raise MissingEvidenceError(f"Referenced evidence artifact '{data.evidence_id}' does not exist.")
            if ev.task_id != task_id:
                raise MissingEvidenceError(
                    f"Referenced evidence artifact '{data.evidence_id}' belongs to task '{ev.task_id}', not '{task_id}'."
                )
            if not evidence_dict:
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

        # Broadcast event to active SSE subscribers after commit
        event_payload = {
            "event_id": transition_id,
            "task_id": task_id,
            "from_status": current_status.value,
            "to_status": target_status.value,
            "actor_type": data.actor_type.value,
            "actor_id": data.actor_id,
            "reason": data.reason,
            "evidence_id": data.evidence_id,
            "timestamp": now,
        }
        event_broadcaster.publish(task_id, event_payload)

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
        workspace_id: Optional[str] = None,
    ) -> TaskResponse:
        """Execute human approval for a task currently awaiting approval within authorized workspace."""
        task = self.get_task(task_id, workspace_id=workspace_id)
        transition_req = TransitionRequest(
            target_status=TaskStatus.APPROVED,
            actor_type=actor_type,
            actor_id=approval_req.reviewer_id,
            reason=approval_req.comments or "Human approved proposed fix",
        )
        self.record_transition(task_id, transition_req, workspace_id=workspace_id)

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

        return self.get_task(task_id, workspace_id=workspace_id)

    def record_human_rejection(
        self,
        task_id: str,
        rejection_req: RejectionRequest,
        actor_type: CallerType = CallerType.HUMAN,
        workspace_id: Optional[str] = None,
    ) -> TaskResponse:
        """Execute human rejection with feedback and target return state within authorized workspace."""
        task = self.get_task(task_id, workspace_id=workspace_id)
        transition_req = TransitionRequest(
            target_status=TaskStatus.REJECTED,
            actor_type=actor_type,
            actor_id=rejection_req.reviewer_id,
            reason=rejection_req.feedback,
        )
        self.record_transition(task_id, transition_req, workspace_id=workspace_id)

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
                workspace_id=workspace_id,
            )

        return self.get_task(task_id, workspace_id=workspace_id)

    def preview_share_task(
        self,
        task_id: str,
        source_workspace_id: str,
        target_workspace_id: str,
    ) -> Dict[str, Any]:
        """Preview cross-workspace task transfer without executing changes."""
        source_task = self.get_task(task_id, workspace_id=source_workspace_id)
        evidence = self.list_evidence_for_task(task_id, workspace_id=source_workspace_id)
        return {
            "task_id": source_task.id,
            "task_title": source_task.title,
            "source_workspace_id": source_workspace_id,
            "target_workspace_id": target_workspace_id,
            "evidence_count": len(evidence),
            "confirmed": False,
            "warning": "Cross-workspace transfer will copy task definition and verified evidence only. Private messages and conversation threads will NOT be transferred.",
        }

    def share_task(
        self,
        task_id: str,
        source_workspace_id: str,
        target_workspace_id: str,
        shared_by_user_id: str,
    ) -> TaskResponse:
        """Explicitly share a task across workspaces via controlled copy without leaking private context."""
        source_task = self.get_task(task_id, workspace_id=source_workspace_id)

        with get_connection(self.db_path) as conn:
            target_ws = conn.execute("SELECT * FROM workspaces WHERE id = ?;", (target_workspace_id.strip(),)).fetchone()
            if not target_ws:
                raise TaskNotFoundError(f"Target workspace '{target_workspace_id}' not found.")
            target_ws_type = target_ws["workspace_type"]

        shared_create = TaskCreate(
            title=f"[Shared] {source_task.title}",
            description=source_task.description,
            reported_by=f"shared:{source_workspace_id}:{shared_by_user_id}",
            input_source="explicit_sharing",
            repository_url=source_task.repository_url,
            branch_name=source_task.branch_name,
            workspace_id=target_workspace_id,
            workspace_type=target_ws_type,
        )
        new_task = self.create_task(shared_create, workspace_id=target_workspace_id, workspace_type=target_ws_type)

        # Copy verified evidence if available (decoupled from private mappings/memory)
        evidence_list = self.list_evidence_for_task(task_id)
        for ev in evidence_list:
            self.add_evidence(
                new_task.id,
                EvidenceCreate(
                    stage=ev.stage,
                    command_executed=ev.command_executed,
                    exit_code=ev.exit_code,
                    stdout=ev.stdout,
                    stderr=ev.stderr,
                    patch_diff=ev.patch_diff,
                    is_mock=ev.is_mock,
                ),
                workspace_id=target_workspace_id,
            )

        # Record audit log in workspace_sharing_audit
        with get_connection(self.db_path) as conn:
            with conn:
                audit_id = f"audit_{uuid.uuid4().hex[:12]}"
                now = _utc_now()
                conn.execute(
                    """
                    INSERT INTO workspace_sharing_audit (
                        id, source_workspace_id, target_workspace_id,
                        resource_type, resource_id, shared_by_user_id, content_preview, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        audit_id,
                        source_workspace_id.strip(),
                        target_workspace_id.strip(),
                        "task",
                        task_id,
                        shared_by_user_id.strip(),
                        f"Task: {source_task.title}",
                        now,
                    ),
                )

        return new_task

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

    def get_transitions_after(
        self, task_id: str, last_event_id: Optional[str] = None
    ) -> List[TransitionResponse]:
        """Retrieve chronological transitions recorded after last_event_id for replay."""
        # Ensure task exists
        self.get_task(task_id)

        if last_event_id:
            query = """
            SELECT * FROM task_transitions
            WHERE task_id = ?
              AND rowid > (SELECT COALESCE(MAX(rowid), 0) FROM task_transitions WHERE id = ? AND task_id = ?)
            ORDER BY rowid ASC;
            """
            params = (task_id, last_event_id, task_id)
        else:
            query = "SELECT * FROM task_transitions WHERE task_id = ? ORDER BY rowid ASC;"
            params = (task_id,)

        with get_connection(self.db_path) as conn:
            rows = conn.execute(query, params).fetchall()
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

