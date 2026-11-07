"""SQLite database session manager and schema initializer."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Generator, Optional
from app.core.config import settings

DDL_STATEMENTS = """
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    reported_by TEXT NOT NULL,
    input_source TEXT NOT NULL DEFAULT 'text',
    status TEXT NOT NULL DEFAULT 'REPORTED',
    repository_url TEXT,
    branch_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    command_executed TEXT NOT NULL,
    exit_code INTEGER NOT NULL,
    stdout TEXT,
    stderr TEXT,
    patch_diff TEXT,
    metadata_json TEXT,
    is_mock INTEGER NOT NULL DEFAULT 0,
    recorded_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_evidence_task_id ON evidence(task_id);

CREATE TABLE IF NOT EXISTS task_transitions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    reason TEXT,
    evidence_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY(evidence_id) REFERENCES evidence(id)
);

CREATE INDEX IF NOT EXISTS idx_transitions_task_id ON task_transitions(task_id);

CREATE TABLE IF NOT EXISTS approval_records (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    reviewer_id TEXT NOT NULL,
    feedback TEXT,
    decided_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_approval_task_id ON approval_records(task_id);

CREATE TABLE IF NOT EXISTS conversation_task_mappings (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    thread_id TEXT,
    user_id TEXT NOT NULL,
    user_display_name TEXT,
    task_id TEXT NOT NULL,
    intent_category TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conv_task_plat_conv ON conversation_task_mappings(platform, conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_task_id ON conversation_task_mappings(task_id);
CREATE INDEX IF NOT EXISTS idx_conv_task_plat_thread ON conversation_task_mappings(platform, thread_id);

CREATE TABLE IF NOT EXISTS reviewer_role_assignments (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_handle TEXT,
    role TEXT NOT NULL,
    assigned_by TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rev_roles_plat_user ON reviewer_role_assignments(platform, user_id, role);

CREATE TABLE IF NOT EXISTS processed_chat_events (
    event_id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    processed_at TEXT NOT NULL
);
"""


def parse_sqlite_path(database_url: str) -> str:
    """Extract file path from sqlite URL format (e.g. sqlite:///./shipdev.db)."""
    if database_url.startswith("sqlite:///"):
        return database_url.replace("sqlite:///", "")
    return database_url


def get_db_path(custom_path: Optional[str] = None) -> str:
    """Return the resolved filesystem path for the SQLite database."""
    if custom_path:
        return custom_path
    raw_path = parse_sqlite_path(settings.DATABASE_URL)
    # If relative, anchor to backend directory
    p = Path(raw_path)
    if not p.is_absolute():
        backend_dir = Path(__file__).resolve().parent.parent.parent
        return str(backend_dir / p)
    return str(p)


@contextmanager
def get_connection(db_path: Optional[str] = None) -> Generator[sqlite3.Connection, None, None]:
    """Yield a configured SQLite connection with WAL mode and foreign keys enabled."""
    target_path = get_db_path(custom_path=db_path)
    conn = sqlite3.connect(target_path, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA busy_timeout = 30000;")
        yield conn
    finally:
        conn.close()


def init_db(db_path: Optional[str] = None) -> None:
    """Initialize SQLite database tables and indexes."""
    with get_connection(db_path=db_path) as conn:
        with conn:
            conn.executescript(DDL_STATEMENTS)
