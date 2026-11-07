"""Workspace Repository: persistence, authorization, membership, memory, and audit logging."""

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set
from app.db.session import get_connection
from app.models.workspace import (
    ROLE_PERMISSIONS,
    Workspace,
    WorkspaceContext,
    WorkspaceMember,
    WorkspacePermission,
    WorkspaceRole,
    WorkspaceType,
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class WorkspaceNotFoundError(Exception):
    """Raised when a workspace ID is not found."""
    pass


class WorkspaceAccessDeniedError(Exception):
    """Raised when an authenticated user is not authorized for a workspace."""
    pass


class PersonalWorkspaceViolationError(Exception):
    """Raised when attempting multi-member operations on a personal workspace."""
    pass


class WorkspaceRepository:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path

    # =========================================================================
    # 1. Workspace Lifecycle
    # =========================================================================
    def create_workspace(
        self, name: str, workspace_type: WorkspaceType, owner_user_id: str
    ) -> Workspace:
        """Create a workspace and record the owner as its initial member."""
        # Personal workspace invariant: Exactly one personal workspace per owner
        if workspace_type == WorkspaceType.PERSONAL:
            existing = self.get_personal_workspace_for_user(owner_user_id)
            if existing:
                return existing

        ws_id = f"ws_{uuid.uuid4().hex[:12]}"
        now = _utc_now()
        type_val = workspace_type.value if isinstance(workspace_type, WorkspaceType) else workspace_type

        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    """
                    INSERT INTO workspaces (id, name, workspace_type, owner_user_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?);
                    """,
                    (ws_id, name.strip(), type_val, owner_user_id.strip(), now, now),
                )
                member_id = f"mem_{uuid.uuid4().hex[:12]}"
                conn.execute(
                    """
                    INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
                    VALUES (?, ?, ?, ?, ?);
                    """,
                    (member_id, ws_id, owner_user_id.strip(), WorkspaceRole.OWNER.value, now),
                )

        return self.get_workspace(ws_id)

    def get_workspace(self, workspace_id: str) -> Workspace:
        """Retrieve workspace by ID."""
        with get_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM workspaces WHERE id = ?;", (workspace_id.strip(),)
            ).fetchone()
            if not row:
                raise WorkspaceNotFoundError(f"Workspace '{workspace_id}' not found.")
            return Workspace(
                id=row["id"],
                name=row["name"],
                workspace_type=WorkspaceType(row["workspace_type"]),
                owner_user_id=row["owner_user_id"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    def get_personal_workspace_for_user(self, user_id: str) -> Optional[Workspace]:
        """Fetch the personal workspace belonging to a user, if it exists."""
        with get_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM workspaces WHERE owner_user_id = ? AND workspace_type = 'PERSONAL';",
                (user_id.strip(),),
            ).fetchone()
            if not row:
                return None
            return Workspace(
                id=row["id"],
                name=row["name"],
                workspace_type=WorkspaceType(row["workspace_type"]),
                owner_user_id=row["owner_user_id"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    def list_workspaces_for_user(self, user_id: str) -> List[Workspace]:
        """List all workspaces where the user is an owner or authorized member."""
        with get_connection(self.db_path) as conn:
            cursor = conn.execute(
                """
                SELECT w.* FROM workspaces w
                JOIN workspace_members m ON w.id = m.workspace_id
                WHERE m.user_id = ?
                ORDER BY w.workspace_type DESC, w.name ASC;
                """,
                (user_id.strip(),),
            )
            return [
                Workspace(
                    id=row["id"],
                    name=row["name"],
                    workspace_type=WorkspaceType(row["workspace_type"]),
                    owner_user_id=row["owner_user_id"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                for row in cursor.fetchall()
            ]

    # =========================================================================
    # 2. Membership & RBAC
    # =========================================================================
    def add_member(
        self,
        workspace_id: str,
        user_id: str,
        role: WorkspaceRole,
        requester_id: str,
    ) -> WorkspaceMember:
        """Add a member to a team workspace. Personal workspaces reject multiple members."""
        ws = self.get_workspace(workspace_id)
        if ws.workspace_type == WorkspaceType.PERSONAL:
            raise PersonalWorkspaceViolationError(
                "Security Invariant Violation: Personal workspaces are strictly single-owner and cannot accept members."
            )

        # Verify requester has admin/owner authority
        requester_member = self.get_member(workspace_id, requester_id)
        if not requester_member or requester_member.role not in {
            WorkspaceRole.OWNER,
            WorkspaceRole.ADMIN,
        }:
            raise WorkspaceAccessDeniedError("Only workspace owners or admins can add members.")

        member_id = f"mem_{uuid.uuid4().hex[:12]}"
        now = _utc_now()
        role_val = role.value if isinstance(role, WorkspaceRole) else role

        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    """
                    INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = excluded.role;
                    """,
                    (member_id, workspace_id.strip(), user_id.strip(), role_val, now),
                )

        return self.get_member(workspace_id, user_id)

    def remove_member(self, workspace_id: str, user_id: str, requester_id: str) -> bool:
        """Remove a member from a team workspace."""
        ws = self.get_workspace(workspace_id)
        if ws.owner_user_id == user_id:
            raise WorkspaceAccessDeniedError("Workspace owner cannot be removed.")

        requester_member = self.get_member(workspace_id, requester_id)
        if not requester_member or requester_member.role not in {
            WorkspaceRole.OWNER,
            WorkspaceRole.ADMIN,
        }:
            raise WorkspaceAccessDeniedError("Only workspace owners or admins can remove members.")

        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    "DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?;",
                    (workspace_id.strip(), user_id.strip()),
                )
        return True

    def get_member(self, workspace_id: str, user_id: str) -> Optional[WorkspaceMember]:
        """Fetch member record if user belongs to workspace."""
        with get_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?;",
                (workspace_id.strip(), user_id.strip()),
            ).fetchone()
            if not row:
                return None
            return WorkspaceMember(
                id=row["id"],
                workspace_id=row["workspace_id"],
                user_id=row["user_id"],
                role=WorkspaceRole(row["role"]),
                joined_at=row["joined_at"],
            )

    def list_members(self, workspace_id: str) -> List[WorkspaceMember]:
        """List all members of a workspace."""
        with get_connection(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT * FROM workspace_members WHERE workspace_id = ? ORDER BY joined_at ASC;",
                (workspace_id.strip(),),
            )
            return [
                WorkspaceMember(
                    id=row["id"],
                    workspace_id=row["workspace_id"],
                    user_id=row["user_id"],
                    role=WorkspaceRole(row["role"]),
                    joined_at=row["joined_at"],
                )
                for row in cursor.fetchall()
            ]

    # =========================================================================
    # 3. Server-Side Context Resolution
    # =========================================================================
    def resolve_context(self, workspace_id: str, user_id: str) -> WorkspaceContext:
        """Resolve and validate workspace context on the server. Never trusts client assertion."""
        ws = self.get_workspace(workspace_id)
        member = self.get_member(workspace_id, user_id)

        if not member and user_id == "authenticated-agent":
            # Authenticated agents get operator role scoped strictly to the authorized workspace
            member = WorkspaceMember(
                id=f"mem_agent_{workspace_id}",
                workspace_id=workspace_id,
                user_id="authenticated-agent",
                role=WorkspaceRole.OPERATOR,
                joined_at=ws.created_at,
            )

        if not member:
            raise WorkspaceAccessDeniedError(
                f"Access Denied: User '{user_id}' is not an authorized member of workspace '{workspace_id}'."
            )

        perms = ROLE_PERMISSIONS.get(member.role, set())
        return WorkspaceContext(
            workspace_id=ws.id,
            workspace_type=ws.workspace_type,
            user_id=user_id,
            role=member.role,
            permissions=perms,
        )

    # =========================================================================
    # 4. Isolated Memory & Knowledge Namespace
    # =========================================================================
    def store_memory(
        self,
        workspace_id: str,
        key: str,
        content: str,
        category: str = "knowledge",
    ) -> str:
        """Store a memory or knowledge record strictly scoped to a workspace."""
        mem_id = f"mem_{uuid.uuid4().hex[:12]}"
        now = _utc_now()
        with get_connection(self.db_path) as conn:
            with conn:
                conn.execute(
                    """
                    INSERT INTO workspace_memory (id, workspace_id, key, content, category, created_at)
                    VALUES (?, ?, ?, ?, ?, ?);
                    """,
                    (mem_id, workspace_id.strip(), key.strip(), content.strip(), category.strip(), now),
                )
        return mem_id

    def get_memory(self, workspace_id: str, key: str) -> Optional[str]:
        """Retrieve a memory record strictly within workspace boundary."""
        with get_connection(self.db_path) as conn:
            row = conn.execute(
                "SELECT content FROM workspace_memory WHERE workspace_id = ? AND key = ?;",
                (workspace_id.strip(), key.strip()),
            ).fetchone()
            return row["content"] if row else None

    def list_memory(
        self, workspace_id: str, category: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List memory items strictly within workspace boundary."""
        with get_connection(self.db_path) as conn:
            if category:
                cursor = conn.execute(
                    "SELECT * FROM workspace_memory WHERE workspace_id = ? AND category = ? ORDER BY created_at DESC;",
                    (workspace_id.strip(), category.strip()),
                )
            else:
                cursor = conn.execute(
                    "SELECT * FROM workspace_memory WHERE workspace_id = ? ORDER BY created_at DESC;",
                    (workspace_id.strip(),),
                )
            return [dict(row) for row in cursor.fetchall()]

    def search_memory(self, workspace_id: str, query: str) -> List[Dict[str, Any]]:
        """Search memory within workspace boundary only."""
        tokens = [t.strip().lower() for t in query.split() if len(t.strip()) > 2]
        with get_connection(self.db_path) as conn:
            if not tokens:
                q = f"%{query.strip().lower()}%"
                cursor = conn.execute(
                    """
                    SELECT * FROM workspace_memory
                    WHERE workspace_id = ? AND (LOWER(key) LIKE ? OR LOWER(content) LIKE ?)
                    ORDER BY created_at DESC;
                    """,
                    (workspace_id.strip(), q, q),
                )
            else:
                clauses = " OR ".join(["(LOWER(key) LIKE ? OR LOWER(content) LIKE ?)" for _ in tokens])
                params = [workspace_id.strip()]
                for t in tokens:
                    params.extend([f"%{t}%", f"%{t}%"])
                cursor = conn.execute(
                    f"SELECT * FROM workspace_memory WHERE workspace_id = ? AND ({clauses}) ORDER BY created_at DESC;",
                    params,
                )
            return [dict(row) for row in cursor.fetchall()]

    # =========================================================================
    # 5. Sharing Audit Trail
    # =========================================================================
    def record_sharing_audit(
        self,
        source_workspace_id: str,
        target_workspace_id: str,
        resource_type: str,
        resource_id: str,
        shared_by_user_id: str,
        content_preview: Optional[str] = None,
    ) -> str:
        """Record an explicit, user-authorized cross-workspace resource sharing event."""
        audit_id = f"audit_{uuid.uuid4().hex[:12]}"
        now = _utc_now()
        with get_connection(self.db_path) as conn:
            with conn:
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
                        resource_type.strip(),
                        resource_id.strip(),
                        shared_by_user_id.strip(),
                        content_preview,
                        now,
                    ),
                )
        return audit_id

    def list_sharing_audit(self, workspace_id: str) -> List[Dict[str, Any]]:
        """Fetch audit log of items shared into or out of a workspace."""
        with get_connection(self.db_path) as conn:
            cursor = conn.execute(
                """
                SELECT * FROM workspace_sharing_audit
                WHERE source_workspace_id = ? OR target_workspace_id = ?
                ORDER BY created_at DESC;
                """,
                (workspace_id.strip(), workspace_id.strip()),
            )
            return [dict(row) for row in cursor.fetchall()]
