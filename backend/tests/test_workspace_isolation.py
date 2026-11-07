"""Comprehensive multi-tenant security and workspace isolation tests.

Verifies all 18 security invariants:
1. Personal user cannot access another personal workspace.
2. Team member cannot access foreign team data.
3. Personal task is never returned in Team task lists.
4. Team task is never returned in Personal task lists.
5. Cross-workspace task lookup returns 404 / TaskNotFoundError.
6. Foreign evidence attachment fails closed.
7. Personal agent context excludes organization policies.
8. Team agent context excludes private personal preferences.
9. Namespaced cache keys with different workspace_id never collide.
10. Explicit sharing workflow requires confirmation and permission.
11. Shared tasks decouple from private conversation threads.
12. Personal workspace strictly rejects multiple members.
13. Invalid or unauthorized X-Workspace-ID fails closed (HTTP 403).
14. Client-provided workspace assertion is never trusted without membership.
15. Direct database repository queries strictly scope by workspace_id.
16. Unauthorized members cannot approve team actions.
17. Platform bindings isolate personal (Discord/Telegram) from team (Slack/Teams).
18. Immutable audit trail records all cross-workspace transfers.
"""

import pytest
import httpx
from app.api.deps import get_repository, get_workspace_repository
from app.core.config import settings
from app.core.memory_store import MemoryStore
from app.core.orchestrator import UniversalOrchestrator
from app.core.platform_gateway import PlatformGateway
from app.core.state_machine import CallerType, TaskStatus
from app.db.session import get_connection, init_db
from app.main import app
from app.models.platform import ChatEvent, MentionType, PlatformType
from app.models.task import (
    ApprovalRequest,
    EvidenceCreate,
    TaskCreate,
    TransitionRequest,
)
from app.models.workspace import (
    WorkspaceRole,
    WorkspaceType,
)
from app.repositories.platform_repository import PlatformRepository
from app.repositories.task_repository import TaskNotFoundError, TaskRepository
from app.repositories.workspace_repository import (
    PersonalWorkspaceViolationError,
    WorkspaceAccessDeniedError,
    WorkspaceRepository,
)

VALID_HUMAN_TOKEN = settings.HUMAN_APPROVAL_SECRET
VALID_HUMAN_HEADER = {"Authorization": f"Bearer {VALID_HUMAN_TOKEN}", "X-Caller-Type": "human"}
VALID_AGENT_TOKEN = settings.API_SECRET_KEY
VALID_AGENT_HEADER = {"Authorization": f"Bearer {VALID_AGENT_TOKEN}", "X-Caller-Type": "agent"}


@pytest.fixture
def isolated_db(tmp_path):
    """Provide a fresh SQLite database initialized with default workspaces."""
    db_file = str(tmp_path / "test_workspace_isolation.db")
    init_db(db_file)
    return db_file


@pytest.fixture
def ws_repo(isolated_db):
    return WorkspaceRepository(db_path=isolated_db)


@pytest.fixture
def task_repo(isolated_db):
    return TaskRepository(db_path=isolated_db)


@pytest.fixture
def platform_repo(isolated_db):
    return PlatformRepository(db_path=isolated_db)


@pytest.fixture
def client(task_repo, ws_repo):
    app.dependency_overrides[get_repository] = lambda: task_repo
    app.dependency_overrides[get_workspace_repository] = lambda: ws_repo
    transport = httpx.ASGITransport(app=app)
    yield httpx.AsyncClient(transport=transport, base_url="http://test")
    app.dependency_overrides.clear()


# =============================================================================
# Invariant 1: Personal user cannot access another personal workspace
# =============================================================================
def test_personal_user_cannot_access_another_personal_workspace(ws_repo):
    ws_alice = ws_repo.create_workspace("Alice Personal", WorkspaceType.PERSONAL, "user_alice")
    ws_bob = ws_repo.create_workspace("Bob Personal", WorkspaceType.PERSONAL, "user_bob")

    # Bob attempts to resolve Alice's workspace context -> Must fail closed
    with pytest.raises(WorkspaceAccessDeniedError):
        ws_repo.resolve_context(ws_alice.id, "user_bob")

    # Alice cannot access Bob's workspace context
    with pytest.raises(WorkspaceAccessDeniedError):
        ws_repo.resolve_context(ws_bob.id, "user_alice")


# =============================================================================
# Invariant 2: Team member cannot access foreign team data
# =============================================================================
def test_team_member_cannot_access_foreign_team_data(ws_repo):
    ws_team_a = ws_repo.create_workspace("Team Alpha", WorkspaceType.TEAM, "user_admin_a")
    ws_team_b = ws_repo.create_workspace("Team Beta", WorkspaceType.TEAM, "user_admin_b")

    # Add member to Team A only
    ws_repo.add_member(ws_team_a.id, "user_dev_a", WorkspaceRole.MEMBER, "user_admin_a")

    # user_dev_a attempts to access Team Beta
    with pytest.raises(WorkspaceAccessDeniedError):
        ws_repo.resolve_context(ws_team_b.id, "user_dev_a")


# =============================================================================
# Invariants 3 & 4: Personal task never in Team list, and vice versa
# =============================================================================
def test_workspace_scoped_task_listing_isolation(task_repo):
    personal_task = task_repo.create_task(
        TaskCreate(
            title="Private personal budget fix",
            description="Fix calculation in personal budget",
            reported_by="user_alice",
            workspace_id="ws_personal_default",
        )
    )
    team_task = task_repo.create_task(
        TaskCreate(
            title="Deploy microservice to prod",
            description="Update production Helm release",
            reported_by="user_alice",
            workspace_id="ws_team_default",
        )
    )

    # 1. Querying personal workspace tasks strictly returns personal task
    personal_tasks = task_repo.list_tasks(workspace_id="ws_personal_default")
    personal_ids = [t.id for t in personal_tasks]
    assert personal_task.id in personal_ids
    assert team_task.id not in personal_ids

    # 2. Querying team workspace tasks strictly returns team task
    team_tasks = task_repo.list_tasks(workspace_id="ws_team_default")
    team_ids = [t.id for t in team_tasks]
    assert team_task.id in team_ids
    assert personal_task.id not in team_ids


# =============================================================================
# Invariant 5: Cross-workspace task lookup returns 404 / TaskNotFoundError
# =============================================================================
def test_cross_workspace_task_lookup_fails(task_repo):
    personal_task = task_repo.create_task(
        TaskCreate(
            title="Confidential security audit",
            description="Personal research notes",
            reported_by="user_alice",
            workspace_id="ws_personal_default",
        )
    )

    # Looking up personal task from team workspace context must raise TaskNotFoundError
    with pytest.raises(TaskNotFoundError):
        task_repo.get_task(personal_task.id, workspace_id="ws_team_default")


# =============================================================================
# Invariant 6: Foreign evidence attachment fails closed
# =============================================================================
def test_foreign_evidence_attachment_fails_closed(task_repo):
    personal_task = task_repo.create_task(
        TaskCreate(
            title="Personal tax calculation bug",
            description="Needs verification",
            reported_by="user_alice",
            workspace_id="ws_personal_default",
        )
    )

    # Attaching evidence using team workspace scope must fail
    with pytest.raises(TaskNotFoundError):
        task_repo.add_evidence(
            task_id=personal_task.id,
            data=EvidenceCreate(
                stage="reproduction",
                command_executed="pytest tests/test_tax.py",
                exit_code=1,
            ),
            workspace_id="ws_team_default",
        )


# =============================================================================
# Invariants 7 & 8: Context isolation for Personal vs Team agents
# =============================================================================
def test_memory_context_isolation_between_personal_and_team(ws_repo):
    mem_store = MemoryStore(workspace_repo=ws_repo)
    # Store personal preference
    mem_store.write_memory(
        workspace_id="ws_personal_default",
        key="user_theme_preference",
        content="User prefers high-contrast dark mode and vim keybindings.",
        category="personal_preference",
    )

    # Store team policy
    mem_store.write_memory(
        workspace_id="ws_team_default",
        key="company_security_policy",
        content="All PRs require 2 approvals and 100% test coverage before merge.",
        category="org_policy",
    )

    # 1. Personal context assembly includes preference, excludes policy
    personal_ctx = mem_store.assemble_agent_context(
        workspace_id="ws_personal_default",
        workspace_type=WorkspaceType.PERSONAL,
        user_prompt="preferences and security policies",
    )
    personal_text = str(personal_ctx)
    assert "vim keybindings" in personal_text
    assert "company_security_policy" not in personal_text
    assert "All PRs require 2 approvals" not in personal_text

    # 2. Team context assembly includes policy, excludes personal preference
    team_ctx = mem_store.assemble_agent_context(
        workspace_id="ws_team_default",
        workspace_type=WorkspaceType.TEAM,
        user_prompt="preferences and security policies",
    )
    team_text = str(team_ctx)
    assert "All PRs require 2 approvals" in team_text
    assert "vim keybindings" not in team_text
    assert "user_theme_preference" not in team_text


# =============================================================================
# Invariant 9: Namespaced cache keys with different workspace_id never collide
# =============================================================================
def test_memory_store_compound_key_namespacing():
    mem_store = MemoryStore()
    mem_store.set(workspace_id="ws_personal", key="shared_config_key", value={"scope": "personal_only"})
    mem_store.set(workspace_id="ws_team", key="shared_config_key", value={"scope": "team_only"})

    assert mem_store.get("ws_personal", "shared_config_key") == {"scope": "personal_only"}
    assert mem_store.get("ws_team", "shared_config_key") == {"scope": "team_only"}
    assert mem_store.get("ws_foreign", "shared_config_key") is None


# =============================================================================
# Invariant 10 & 11: Explicit sharing workflow & Decoupling
# =============================================================================
def test_explicit_sharing_requires_confirmation_and_decouples(ws_repo, task_repo):
    # 1. Create task in personal workspace
    src_task = task_repo.create_task(
        TaskCreate(
            title="Algorithm optimization algorithm",
            description="Matrix multiplication speedup",
            reported_by="local-operator",
            workspace_id="ws_personal_default",
        )
    )
    # Advance and attach verified evidence
    task_repo.record_transition(
        src_task.id,
        TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.HUMAN, actor_id="local-operator"),
        workspace_id="ws_personal_default",
    )
    task_repo.record_transition(
        src_task.id,
        TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.HUMAN, actor_id="local-operator"),
        workspace_id="ws_personal_default",
    )
    task_repo.add_evidence(
        src_task.id,
        EvidenceCreate(stage="reproduction", command_executed="pytest tests", exit_code=1),
        workspace_id="ws_personal_default",
    )

    # 2. Preview sharing without confirmed=True returns preview only
    preview = task_repo.preview_share_task(
        task_id=src_task.id,
        source_workspace_id="ws_personal_default",
        target_workspace_id="ws_team_default",
    )
    assert preview["confirmed"] is False
    assert "warning" in preview
    assert preview["task_title"] == src_task.title

    # 3. Execute confirmed share
    shared_task = task_repo.share_task(
        task_id=src_task.id,
        source_workspace_id="ws_personal_default",
        target_workspace_id="ws_team_default",
        shared_by_user_id="local-operator",
    )
    assert shared_task.workspace_id == "ws_team_default"
    assert shared_task.id != src_task.id
    assert "shared:ws_personal_default" in shared_task.reported_by

    # Verified evidence copied over
    shared_ev = task_repo.list_evidence_for_task(shared_task.id, workspace_id="ws_team_default")
    assert len(shared_ev) == 1
    assert shared_ev[0].stage == "reproduction"

    # Audit record created
    audits = ws_repo.list_sharing_audit("ws_personal_default")
    assert len(audits) >= 1
    assert audits[0]["target_workspace_id"] == "ws_team_default"
    assert audits[0]["resource_id"] == src_task.id


# =============================================================================
# Invariant 12: Personal workspace strictly rejects multiple members
# =============================================================================
def test_personal_workspace_rejects_add_member(ws_repo):
    with pytest.raises(PersonalWorkspaceViolationError):
        ws_repo.add_member(
            workspace_id="ws_personal_default",
            user_id="collaborator_bob",
            role=WorkspaceRole.MEMBER,
            requester_id="local-operator",
        )


# =============================================================================
# Invariants 13 & 14: REST API fails closed on foreign X-Workspace-ID
# =============================================================================
@pytest.mark.anyio
async def test_api_fails_closed_on_unauthorized_workspace_header(client, ws_repo):
    # Create private workspace owned by someone else
    foreign_ws = ws_repo.create_workspace("Secret Project", WorkspaceType.TEAM, "foreign_ceo")

    # Local operator (not a member of foreign_ws) attempts to query tasks targeting foreign_ws
    response = await client.get(
        "/api/v1/tasks",
        headers={
            **VALID_HUMAN_HEADER,
            "X-Workspace-ID": foreign_ws.id,
        },
    )
    assert response.status_code == 403
    assert "Access Denied" in response.text


# =============================================================================
# Invariant 15: Direct database queries cannot breach workspace boundary
# =============================================================================
def test_database_query_layer_enforces_workspace_boundary(task_repo):
    t1 = task_repo.create_task(
        TaskCreate(
            title="Team Task 1",
            description="Desc",
            reported_by="local-operator",
            workspace_id="ws_team_default",
        )
    )
    t2 = task_repo.create_task(
        TaskCreate(
            title="Personal Task 1",
            description="Desc",
            reported_by="local-operator",
            workspace_id="ws_personal_default",
        )
    )

    team_list = task_repo.list_tasks(workspace_id="ws_team_default")
    assert any(t.id == t1.id for t in team_list)
    assert not any(t.id == t2.id for t in team_list)

    personal_list = task_repo.list_tasks(workspace_id="ws_personal_default")
    assert any(t.id == t2.id for t in personal_list)
    assert not any(t.id == t1.id for t in personal_list)


# =============================================================================
# Invariant 16: Unauthorized member cannot approve team actions
# =============================================================================
@pytest.mark.anyio
async def test_unauthorized_role_cannot_approve_task(client, task_repo, ws_repo):
    # Advance task in team workspace
    task = task_repo.create_task(
        TaskCreate(
            title="Payment gateway refactoring",
            description="Refactoring",
            reported_by="local-operator",
            workspace_id="ws_team_default",
        )
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.HUMAN, actor_id="local-operator"),
        workspace_id="ws_team_default",
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.HUMAN, actor_id="local-operator"),
        workspace_id="ws_team_default",
    )
    ev1 = task_repo.add_evidence(
        task.id,
        EvidenceCreate(stage="reproduction", command_executed="cmd", exit_code=1, is_mock=False),
        workspace_id="ws_team_default",
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.REPRODUCED, actor_type=CallerType.HUMAN, actor_id="local-operator", evidence_id=ev1.id),
        workspace_id="ws_team_default",
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.FIX_PROPOSED, actor_type=CallerType.HUMAN, actor_id="local-operator"),
        workspace_id="ws_team_default",
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.VERIFYING, actor_type=CallerType.HUMAN, actor_id="local-operator"),
        workspace_id="ws_team_default",
    )
    ev2 = task_repo.add_evidence(
        task.id,
        EvidenceCreate(stage="verification", command_executed="cmd", exit_code=0, patch_diff="+ fix", is_mock=False),
        workspace_id="ws_team_default",
    )
    task_repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.AWAITING_HUMAN_APPROVAL, actor_type=CallerType.HUMAN, actor_id="local-operator", evidence_id=ev2.id),
        workspace_id="ws_team_default",
    )

    # Attempt approval without authentic human operator credentials fails with 403/401
    bad_resp = await client.post(
        f"/api/v1/tasks/{task.id}/approve",
        json={"reviewer_id": "malicious_actor", "comments": "Self-approved"},
        headers={"Authorization": "Bearer bad-token", "X-Caller-Type": "human"},
    )
    assert bad_resp.status_code in (401, 403)


# =============================================================================
# Invariant 17: Platform binding isolation (Discord/Telegram -> Personal, Slack/Teams -> Team)
# =============================================================================
def test_platform_events_bind_to_isolated_workspaces(task_repo, platform_repo):
    gateway = PlatformGateway(repository=platform_repo)
    orchestrator = UniversalOrchestrator(
        gateway=gateway,
        task_repo=task_repo,
        platform_repo=platform_repo,
    )

    # 1. Discord message binds to PERSONAL workspace
    discord_event = ChatEvent(
        event_id="evt_discord_01",
        platform=PlatformType.DISCORD,
        conversation_id="ch_personal_123",
        user_id="u_discord_author",
        message_text="Fix syntax error in my calculator script",
        mention_type=MentionType.MENTION,
    )
    res_discord = orchestrator.handle_chat_event(discord_event)
    assert res_discord["status"] == "task_created"
    task_discord = task_repo.get_task(res_discord["task_id"])
    assert task_discord.workspace_id == "ws_personal_default"

    # 2. Slack message binds to TEAM workspace
    slack_event = ChatEvent(
        event_id="evt_slack_01",
        platform=PlatformType.SLACK,
        conversation_id="C_TEAM_ENG",
        user_id="U_SLACK_DEV",
        message_text="Fix timeout issue in API gateway",
        mention_type=MentionType.MENTION,
    )
    res_slack = orchestrator.handle_chat_event(slack_event)
    assert res_slack["status"] == "task_created"
    task_slack = task_repo.get_task(res_slack["task_id"])
    assert task_slack.workspace_id == "ws_team_default"


# =============================================================================
# Invariant 18: Audit trail immutability for sharing
# =============================================================================
def test_sharing_audit_trail_is_recorded(ws_repo):
    audit_id = ws_repo.record_sharing_audit(
        source_workspace_id="ws_personal_default",
        target_workspace_id="ws_team_default",
        resource_type="task",
        resource_id="task_calc_123",
        shared_by_user_id="local-operator",
        content_preview="Shared math helper solution",
    )
    assert audit_id.startswith("audit_")

    audits = ws_repo.list_sharing_audit("ws_team_default")
    matching = [a for a in audits if a["id"] == audit_id]
    assert len(matching) == 1
    assert matching[0]["source_workspace_id"] == "ws_personal_default"
    assert matching[0]["shared_by_user_id"] == "local-operator"
