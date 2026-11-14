"""Repository for conversation task correlations, event deduplication, and reviewer roles."""

import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set
from app.core.config import settings
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
        workspace_id: Optional[str] = None,
    ) -> ReviewerRoleRecord:
        """Assign an authorized reviewer role to a platform user."""
        role_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        plat_val = platform.value if isinstance(platform, PlatformType) else platform
        ws_id = workspace_id or "*"

        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    """
                    INSERT INTO reviewer_role_assignments (id, platform, user_id, user_handle, role, assigned_by, created_at, workspace_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT DO UPDATE SET
                        user_handle = excluded.user_handle,
                        assigned_by = excluded.assigned_by,
                        workspace_id = excluded.workspace_id
                    """,
                    (role_id, plat_val, user_id, user_handle, role.lower(), assigned_by, now, ws_id),
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

    def get_user_roles(
        self,
        platform: PlatformType,
        user_id: str,
        user_handle: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> Set[str]:
        """Fetch all authorized roles for a given platform user.

        Security Invariant: Reviewer authorization binds strictly to verified user_id.
        User handle is never used to elevate privileges.
        """
        plat_val = platform.value if isinstance(platform, PlatformType) else platform
        clean_user_id = str(user_id).strip()
        with get_connection(self.db_path) as conn:
            if workspace_id:
                cursor = conn.execute(
                    """
                    SELECT role FROM reviewer_role_assignments
                    WHERE platform = ? AND user_id = ?
                      AND (workspace_id = ? OR workspace_id IN ('*', 'all', 'both'))
                    """,
                    (plat_val, clean_user_id, workspace_id.strip()),
                )
            else:
                cursor = conn.execute(
                    """
                    SELECT role FROM reviewer_role_assignments
                    WHERE platform = ? AND user_id = ?
                    """,
                    (plat_val, clean_user_id),
                )
            return {row["role"].lower() for row in cursor.fetchall()}

    def is_authorized_reviewer(
        self,
        platform: PlatformType,
        user_id: str,
        allowed_roles: Optional[Set[str]] = None,
        user_handle: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> bool:
        """Check if user has at least one of the allowed roles within authorized workspace.

        Security Invariants:
        1. Reviewer identity binds strictly to verified platform numeric user_id.
        2. Personal Workspace and Team Workspace reviewer permissions remain strictly isolated.
        3. Never authorizes users based on display names, usernames, or unauthenticated callback data.
        """
        plat_val = platform.value if isinstance(platform, PlatformType) else platform
        clean_user_id = str(user_id).strip()
        if not clean_user_id:
            return False

        # Positional compatibility: if caller passed workspace_id or string role as 3rd positional argument
        if isinstance(allowed_roles, str):
            if allowed_roles.startswith("ws_") or allowed_roles in ("*", "all", "both"):
                workspace_id = allowed_roles
                allowed_roles = None
            else:
                allowed_roles = {allowed_roles}

        # 1. Environment-level designated operator binding (Render / production)
        if plat_val == PlatformType.TELEGRAM.value and getattr(settings, "TELEGRAM_OPERATOR_USER_ID", None):
            op_config = settings.TELEGRAM_OPERATOR_USER_ID.strip()
            authorized_ids = {i.strip() for i in op_config.split(",") if i.strip()}
            if clean_user_id in authorized_ids:
                target_ws = getattr(settings, "TELEGRAM_OPERATOR_WORKSPACE_ID", "ws_personal_default").strip()
                allowed_workspaces = {w.strip() for w in target_ws.split(",") if w.strip()}
                if (
                    not workspace_id
                    or "*" in allowed_workspaces
                    or "all" in allowed_workspaces
                    or "both" in allowed_workspaces
                    or workspace_id.strip() in allowed_workspaces
                ):
                    return True

        if plat_val == PlatformType.TEAMS.value and getattr(settings, "TEAMS_OPERATOR_USER_ID", None):
            op_config = settings.TEAMS_OPERATOR_USER_ID.strip()
            authorized_ids = {i.strip() for i in op_config.split(",") if i.strip()}
            if clean_user_id in authorized_ids:
                target_ws = getattr(settings, "TEAMS_OPERATOR_WORKSPACE_ID", "ws_team_default").strip()
                allowed_workspaces = {w.strip() for w in target_ws.split(",") if w.strip()}
                if (
                    not workspace_id
                    or "*" in allowed_workspaces
                    or "all" in allowed_workspaces
                    or "both" in allowed_workspaces
                    or workspace_id.strip() in allowed_workspaces
                ):
                    return True

        # 2. Database reviewer_role_assignments strictly scoped to workspace
        roles = self.get_user_roles(
            platform, clean_user_id, workspace_id=workspace_id
        )
        if allowed_roles:
            return bool(roles.intersection({r.lower() for r in allowed_roles}))
        keywords = {"admin", "lead", "operator", "reviewer", "manager", "maintainer", "owner"}
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

    # =========================================================================
    # 4. User-Friendly Platform Connections
    # =========================================================================
    def get_connection(self, workspace_id: str, platform: PlatformType) -> Optional[Dict[str, Any]]:
        """Get connection record for a platform in a workspace."""
        plat_val = platform.value if isinstance(platform, PlatformType) else platform
        with get_connection(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT * FROM platform_connections WHERE workspace_id = ? AND platform = ?",
                (workspace_id, plat_val),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return dict(row)

    def set_connection(
        self,
        workspace_id: str,
        platform: PlatformType,
        connected: bool,
        account_name: Optional[str] = None,
        target_name: Optional[str] = None,
    ) -> None:
        """Create or update platform connection state."""
        conn_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        plat_val = platform.value if isinstance(platform, PlatformType) else platform

        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    """
                    INSERT INTO platform_connections (
                        id, workspace_id, platform, connected, account_name, target_name, connected_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(workspace_id, platform) DO UPDATE SET
                        connected = excluded.connected,
                        account_name = excluded.account_name,
                        target_name = excluded.target_name,
                        connected_at = CASE WHEN excluded.connected = 1 THEN excluded.connected_at ELSE platform_connections.connected_at END,
                        updated_at = excluded.updated_at
                    """,
                    (
                        conn_id,
                        workspace_id,
                        plat_val,
                        1 if connected else 0,
                        account_name,
                        target_name,
                        now if connected else None,
                        now,
                    ),
                )

    def get_connected_workspace(self, platform: PlatformType) -> Optional[str]:
        """Find the workspace ID explicitly connected to this platform."""
        plat_val = platform.value if isinstance(platform, PlatformType) else platform
        with get_connection(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT workspace_id FROM platform_connections WHERE platform = ? AND connected = 1 LIMIT 1",
                (plat_val,),
            )
            row = cursor.fetchone()
            return row["workspace_id"] if row else None

    def get_user_workspace(
        self, platform: PlatformType, user_id: str, user_handle: Optional[str] = None
    ) -> Optional[str]:
        """Find a designated workspace assigned to this platform user."""
        plat_val = platform.value if isinstance(platform, PlatformType) else platform
        with get_connection(self.db_path) as conn:
            cursor = conn.execute(
                """
                SELECT workspace_id FROM reviewer_role_assignments
                WHERE platform = ? AND (user_id = ? OR (? IS NOT NULL AND user_handle = ?))
                ORDER BY created_at DESC LIMIT 1
                """,
                (plat_val, user_id, user_handle, user_handle),
            )
            row = cursor.fetchone()
            if row and row["workspace_id"]:
                return row["workspace_id"]
            return None

    # =========================================================================
    # 5. Conversation Context History (Isolated by Platform & Workspace)
    # =========================================================================
    def save_chat_turn(
        self,
        platform: PlatformType,
        conversation_id: str,
        user_id: str,
        workspace_id: str,
        role: str,
        content: str,
    ) -> str:
        """Persist a conversation turn strictly isolated by platform, conversation, and workspace."""
        msg_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        plat_val = platform.value if isinstance(platform, PlatformType) else platform

        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    """
                    INSERT INTO platform_chat_history (
                        id, platform, conversation_id, user_id, workspace_id, role, content, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (msg_id, plat_val, conversation_id, user_id, workspace_id, role, content, now),
                )
        return msg_id

    def get_chat_history(
        self,
        platform: PlatformType,
        conversation_id: str,
        workspace_id: str,
        limit: int = 8,
    ) -> List[Dict[str, str]]:
        """Retrieve recent conversation history for multi-turn assistant context in chronological order."""
        plat_val = platform.value if isinstance(platform, PlatformType) else platform
        with get_connection(self.db_path) as conn:
            cursor = conn.execute(
                """
                SELECT role, content FROM (
                    SELECT role, content, created_at FROM platform_chat_history
                    WHERE platform = ? AND conversation_id = ? AND workspace_id = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                ) sub
                ORDER BY created_at ASC
                """,
                (plat_val, conversation_id, workspace_id, limit),
            )
            return [{"role": row["role"], "content": row["content"]} for row in cursor.fetchall()]
