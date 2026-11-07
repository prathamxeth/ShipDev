"""Repository for conversation task correlations, event deduplication, and reviewer roles."""

import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set
from app.db.session import get_connection
from app.models.platform import (
    ConversationTaskMapping,
    PlatformType,
    ReviewerRoleRecord,
    TaskCategory,
)


class PlatformRepository:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    # =========================================================================
    # 1. Event Deduplication
    # =========================================================================
    def is_event_processed(self, event_id: str) -> bool:
        """Check if an external event ID has already been processed."""
        with get_connection(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT event_id FROM processed_chat_events WHERE event_id = ?",
                (event_id,),
            )
            return cursor.fetchone() is not None

    def mark_event_processed(self, event_id: str, platform: PlatformType) -> None:
        """Record an event ID to prevent duplicate execution upon retries."""
        now = datetime.now(timezone.utc).isoformat()
        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO processed_chat_events (event_id, platform, processed_at)
                    VALUES (?, ?, ?)
                    """,
                    (event_id, platform.value if isinstance(platform, PlatformType) else platform, now),
                )

    # =========================================================================
    # 2. Conversation-to-Task Correlation
    # =========================================================================
    def create_mapping(
        self,
        platform: PlatformType,
        conversation_id: str,
        user_id: str,
        task_id: str,
        thread_id: Optional[str] = None,
        user_display_name: Optional[str] = None,
        intent_category: Optional[TaskCategory] = None,
        status: str = "REPORTED",
    ) -> ConversationTaskMapping:
        """Correlate a chat conversation/thread with a ShipDev task."""
        mapping_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        plat_val = platform.value if isinstance(platform, PlatformType) else platform
        cat_val = intent_category.value if isinstance(intent_category, TaskCategory) else intent_category

        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    """
                    INSERT INTO conversation_task_mappings (
                        id, platform, conversation_id, thread_id, user_id,
                        user_display_name, task_id, intent_category, status, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        mapping_id,
                        plat_val,
                        conversation_id,
                        thread_id,
                        user_id,
                        user_display_name,
                        task_id,
                        cat_val,
                        status,
                        now,
                        now,
                    ),
                )

        return ConversationTaskMapping(
            id=mapping_id,
            platform=PlatformType(plat_val),
            conversation_id=conversation_id,
            thread_id=thread_id,
            user_id=user_id,
            user_display_name=user_display_name,
            task_id=task_id,
            intent_category=TaskCategory(cat_val) if cat_val else None,
            status=status,
            created_at=now,
            updated_at=now,
        )

    def get_mapping_by_id(self, mapping_id: str) -> Optional[ConversationTaskMapping]:
        """Fetch mapping by its unique ID."""
        with get_connection(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT * FROM conversation_task_mappings WHERE id = ?",
                (mapping_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return self._row_to_mapping(row)

    def get_mapping_by_task_id(self, task_id: str) -> Optional[ConversationTaskMapping]:
        """Fetch mapping associated with a specific task."""
        with get_connection(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT * FROM conversation_task_mappings WHERE task_id = ? ORDER BY created_at DESC LIMIT 1",
                (task_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return self._row_to_mapping(row)

    def get_active_mapping(
        self, platform: PlatformType, conversation_id: str, thread_id: Optional[str] = None
    ) -> Optional[ConversationTaskMapping]:
        """Find the most recent non-terminal task correlated with this conversation/thread."""
        plat_val = platform.value if isinstance(platform, PlatformType) else platform
        query = """
            SELECT * FROM conversation_task_mappings
            WHERE platform = ? AND conversation_id = ?
        """
        params: List[Any] = [plat_val, conversation_id]

        if thread_id:
            query += " AND thread_id = ?"
            params.append(thread_id)

        query += " AND status NOT IN ('COMPLETED', 'FAILED') ORDER BY created_at DESC LIMIT 1"

        with get_connection(self.db_path) as conn:
            cursor = conn.execute(query, tuple(params))
            row = cursor.fetchone()
            if not row:
                return None
            return self._row_to_mapping(row)

    def list_mappings(
        self, platform: Optional[PlatformType] = None, limit: int = 50
    ) -> List[ConversationTaskMapping]:
        """List recent conversation-to-task correlations."""
        query = "SELECT * FROM conversation_task_mappings"
        params: List[Any] = []
        if platform:
            query += " WHERE platform = ?"
            params.append(platform.value if isinstance(platform, PlatformType) else platform)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        with get_connection(self.db_path) as conn:
            cursor = conn.execute(query, tuple(params))
            return [self._row_to_mapping(row) for row in cursor.fetchall()]

    def update_mapping_status(self, task_id: str, status: str) -> None:
        """Update correlation status based on task lifecycle transition."""
        now = datetime.now(timezone.utc).isoformat()
        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    "UPDATE conversation_task_mappings SET status = ?, updated_at = ? WHERE task_id = ?",
                    (status, now, task_id),
                )

    def _row_to_mapping(self, row: sqlite3.Row) -> ConversationTaskMapping:
        return ConversationTaskMapping(
            id=row["id"],
            platform=PlatformType(row["platform"]),
            conversation_id=row["conversation_id"],
            thread_id=row["thread_id"],
            user_id=row["user_id"],
            user_display_name=row["user_display_name"],
            task_id=row["task_id"],
            intent_category=TaskCategory(row["intent_category"]) if row["intent_category"] else None,
            status=row["status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    # =========================================================================
    # 3. Reviewer Roles & Server-Side Authorization
    # =========================================================================
    def assign_reviewer_role(
        self,
        platform: PlatformType,
        user_id: str,
        role: str,
        assigned_by: str = "system",
        user_handle: Optional[str] = None,
    ) -> ReviewerRoleRecord:
        """Assign an authorized reviewer role to a platform user."""
        role_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        plat_val = platform.value if isinstance(platform, PlatformType) else platform

        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    """
                    INSERT INTO reviewer_role_assignments (id, platform, user_id, user_handle, role, assigned_by, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(platform, user_id, role) DO UPDATE SET
                        user_handle = excluded.user_handle,
                        assigned_by = excluded.assigned_by
                    """,
                    (role_id, plat_val, user_id, user_handle, role.lower(), assigned_by, now),
                )

        return ReviewerRoleRecord(
            id=role_id,
            platform=PlatformType(plat_val),
            user_id=user_id,
            user_handle=user_handle,
            role=role.lower(),
            assigned_by=assigned_by,
            created_at=now,
        )

    def get_user_roles(self, platform: PlatformType, user_id: str) -> Set[str]:
        """Fetch all authorized roles for a given platform user."""
        plat_val = platform.value if isinstance(platform, PlatformType) else platform
        with get_connection(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT role FROM reviewer_role_assignments WHERE platform = ? AND user_id = ?",
                (plat_val, user_id),
            )
            return {row["role"].lower() for row in cursor.fetchall()}

    def is_authorized_reviewer(
        self, platform: PlatformType, user_id: str, allowed_roles: Optional[Set[str]] = None
    ) -> bool:
        """Check if user has at least one of the allowed roles (defaults to admin, lead, operator, reviewer, manager, maintainer)."""
        roles = self.get_user_roles(platform, user_id)
        if allowed_roles:
            return bool(roles.intersection({r.lower() for r in allowed_roles}))
        keywords = {"admin", "lead", "operator", "reviewer", "manager", "maintainer"}
        return any(any(kw in r for kw in keywords) for r in roles)

    def list_reviewer_roles(self, platform: Optional[PlatformType] = None) -> List[ReviewerRoleRecord]:
        """List all reviewer role assignments."""
        query = "SELECT * FROM reviewer_role_assignments"
        params: List[Any] = []
        if platform:
            query += " WHERE platform = ?"
            params.append(platform.value if isinstance(platform, PlatformType) else platform)
        query += " ORDER BY created_at DESC"

        with get_connection(self.db_path) as conn:
            cursor = conn.execute(query, tuple(params))
            return [
                ReviewerRoleRecord(
                    id=row["id"],
                    platform=PlatformType(row["platform"]),
                    user_id=row["user_id"],
                    user_handle=row["user_handle"],
                    role=row["role"],
                    assigned_by=row["assigned_by"],
                    created_at=row["created_at"],
                )
                for row in cursor.fetchall()
            ]
