"""Workspace Memory and Agent Context Isolation Engine."""

from typing import Any, Dict, List, Optional
from app.models.workspace import WorkspaceType
from app.repositories.workspace_repository import WorkspaceRepository


class MemoryIsolationViolationError(Exception):
    """Raised when memory retrieval crosses workspace boundaries."""
    pass


class WorkspaceMemoryStore:
    def __init__(self, workspace_repo: Optional[WorkspaceRepository] = None):
        self.repo = workspace_repo or WorkspaceRepository()
        self._cache: Dict[str, Any] = {}

    def _get_cache_key(self, workspace_id: str, key: str) -> str:
        """Namespaced cache key enforcing workspace identity in all lookups."""
        if not workspace_id or not workspace_id.strip():
            raise MemoryIsolationViolationError("Workspace identity is missing. Cannot access memory cache.")
        return f"{workspace_id.strip()}::{key.strip()}"

    def write_memory(
        self,
        workspace_id: str,
        key: str,
        content: str,
        category: str = "knowledge",
    ) -> str:
        """Store a memory record within the authorized workspace namespace."""
        if not workspace_id or not workspace_id.strip():
            raise MemoryIsolationViolationError("Cannot write memory without validated workspace identity.")

        mem_id = self.repo.store_memory(
            workspace_id=workspace_id,
            key=key,
            content=content,
            category=category,
        )
        cache_k = self._get_cache_key(workspace_id, key)
        self._cache[cache_k] = content
        return mem_id

    def read_memory(self, workspace_id: str, key: str) -> Optional[str]:
        """Read a memory record strictly scoped to the workspace namespace."""
        if not workspace_id or not workspace_id.strip():
            raise MemoryIsolationViolationError("Cannot read memory without validated workspace identity.")

        cache_k = self._get_cache_key(workspace_id, key)
        if cache_k in self._cache:
            return self._cache[cache_k]

        content = self.repo.get_memory(workspace_id=workspace_id, key=key)
        if content is not None:
            self._cache[cache_k] = content
        return content

    def set(self, workspace_id: str, key: str, value: Any) -> None:
        """Cache-level set for testing or quick in-memory lookups."""
        cache_k = self._get_cache_key(workspace_id, key)
        self._cache[cache_k] = value

    def get(self, workspace_id: str, key: str) -> Optional[Any]:
        """Cache-level get for testing or quick in-memory lookups."""
        cache_k = self._get_cache_key(workspace_id, key)
        return self._cache.get(cache_k)

    def search_context(self, workspace_id: str, query: str) -> List[Dict[str, Any]]:
        """Perform semantic or full-text retrieval strictly filtered by workspace boundary."""
        if not workspace_id or not workspace_id.strip():
            raise MemoryIsolationViolationError("Workspace identity is mandatory for search operations.")
        return self.repo.search_memory(workspace_id=workspace_id, query=query)

    def assemble_agent_context(
        self,
        workspace_id: str,
        workspace_type: WorkspaceType,
        user_prompt: str,
    ) -> Dict[str, Any]:
        """Assemble isolated context window for specialist agent invocation.

        PERSONAL AGENTS:
        - Read personal preferences and private memory only.
        - Cannot access organizational knowledge.

        TEAM AGENTS:
        - Read team policies and organizational guidelines.
        - Cannot access personal preferences or private conversations.
        """
        if not workspace_id or not workspace_id.strip():
            raise MemoryIsolationViolationError("Cannot build agent context without authenticated workspace.")

        relevant_memories = self.search_context(workspace_id, user_prompt)

        if workspace_type == WorkspaceType.PERSONAL:
            # Personal agent context
            return {
                "workspace_id": workspace_id,
                "workspace_type": "PERSONAL",
                "isolation_policy": "Strict Personal: private preferences and personal files only.",
                "knowledge_base": [m for m in relevant_memories if m.get("category") != "org_policy"],
                "org_access_granted": False,
            }
        else:
            # Team agent context
            return {
                "workspace_id": workspace_id,
                "workspace_type": "TEAM",
                "isolation_policy": "Strict Team: organization knowledge only; no personal data.",
                "knowledge_base": [m for m in relevant_memories if m.get("category") != "personal_preference"],
                "org_access_granted": True,
            }


# Alias for backward compatibility
MemoryStore = WorkspaceMemoryStore
