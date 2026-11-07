"""End-to-end integration tests for ShipDev REST APIs, cryptographic human authentication, and security gates."""

import pytest
import httpx
from app.api.deps import get_repository
from app.core.config import settings
from app.core.state_machine import CallerType, TaskStatus
from app.db.session import init_db
from app.main import app
from app.models.task import (
    ApprovalRequest,
    EvidenceCreate,
    TaskCreate,
    TransitionRequest,
)
from app.repositories.task_repository import TaskRepository

VALID_TOKEN = settings.HUMAN_APPROVAL_SECRET
VALID_AUTH_HEADER = {"Authorization": f"Bearer {VALID_TOKEN}"}
VALID_AGENT_TOKEN = settings.API_SECRET_KEY
VALID_AGENT_HEADER = {"Authorization": f"Bearer {VALID_AGENT_TOKEN}"}


@pytest.fixture
def test_repo(tmp_path):
    """Provide a TaskRepository configured with an isolated test SQLite database."""
    db_file = str(tmp_path / "test_api_shipdev.db")
    init_db(db_file)
    return TaskRepository(db_path=db_file)


@pytest.fixture
def client(test_repo):
    """Provide an HTTPX AsyncClient with repository dependency overridden to test_repo."""
    app.dependency_overrides[get_repository] = lambda: test_repo
    transport = httpx.ASGITransport(app=app)
    yield httpx.AsyncClient(transport=transport, base_url="http://test")
    app.dependency_overrides.clear()


def _advance_task_to_awaiting_approval(repo: TaskRepository, task_id: str) -> None:
    """Helper to progress a task from REPORTED to AWAITING_HUMAN_APPROVAL."""
    repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.AGENT, actor_id="a1")
    )
    repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.AGENT, actor_id="a1")
    )
    ev1 = repo.add_evidence(
        task_id, EvidenceCreate(stage="repro", command_executed="cmd", exit_code=1, is_mock=False)
    )
    repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCED, actor_type=CallerType.AGENT, actor_id="a1", evidence_id=ev1.id
        ),
    )
    repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.FIX_PROPOSED, actor_type=CallerType.AGENT, actor_id="a1")
    )
    repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.VERIFYING, actor_type=CallerType.AGENT, actor_id="a1")
    )
    ev2 = repo.add_evidence(
        task_id, EvidenceCreate(stage="verify", command_executed="cmd", exit_code=0, patch_diff="+ fix", is_mock=False)
    )
    repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.AWAITING_HUMAN_APPROVAL,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=ev2.id,
        ),
    )


# ---------------------------------------------------------------------------
# Test 1 & 3: Agent with no credentials / Missing Bearer token is rejected (401)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_agent_with_no_credentials_cannot_approve(client, test_repo):
    """Security Invariant: Missing Bearer token on /approve returns 401 Unauthorized."""
    task = test_repo.create_task(TaskCreate(title="T1", description="D1", reported_by="ayush"))
    _advance_task_to_awaiting_approval(test_repo, task.id)

    res = await client.post(
        f"/api/v1/tasks/{task.id}/approve",
        json={"reviewer_id": "agent-1", "comments": "Bypass attempt"},
    )
    assert res.status_code == 401
    assert "missing bearer token" in res.json()["detail"].lower()
    assert "www-authenticate" in res.headers


# ---------------------------------------------------------------------------
# Test 2: Agent with X-Caller-Type: human cannot approve without Bearer token (401)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_spoofed_human_header_without_token_cannot_approve(client, test_repo):
    """Security Invariant: Spoofed 'X-Caller-Type: human' header without token returns 401."""
    task = test_repo.create_task(TaskCreate(title="T1", description="D1", reported_by="ayush"))
    _advance_task_to_awaiting_approval(test_repo, task.id)

    headers = {"X-Caller-Type": "human", "X-Caller-ID": "ayush"}
    res = await client.post(
        f"/api/v1/tasks/{task.id}/approve",
        json={"reviewer_id": "ayush", "comments": "Spoofed approval"},
        headers=headers,
    )
    assert res.status_code == 401
    assert "missing bearer token" in res.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 4: Invalid Bearer token is rejected (403)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_invalid_bearer_token_is_rejected(client, test_repo):
    """Security Invariant: Invalid Bearer token returns 403 Forbidden."""
    task = test_repo.create_task(TaskCreate(title="T1", description="D1", reported_by="ayush"))
    _advance_task_to_awaiting_approval(test_repo, task.id)

    bad_headers = {"Authorization": "Bearer totally-invalid-secret-key"}
    res = await client.post(
        f"/api/v1/tasks/{task.id}/approve",
        json={"reviewer_id": "ayush", "comments": "Forged token"},
        headers=bad_headers,
    )
    assert res.status_code == 403
    assert any(phrase in res.json()["detail"].lower() for phrase in ["agent api credentials cannot authorize", "invalid human authorization token"])


@pytest.mark.asyncio
async def test_api_secret_key_cannot_approve(client, test_repo):
    """Security Invariant: Machine API_SECRET_KEY cannot be used as a human approval credential."""
    task = test_repo.create_task(TaskCreate(title="T1", description="D1", reported_by="ayush"))
    _advance_task_to_awaiting_approval(test_repo, task.id)

    agent_auth_header = {"Authorization": f"Bearer {settings.API_SECRET_KEY}"}
    res = await client.post(
        f"/api/v1/tasks/{task.id}/approve",
        json={"reviewer_id": "ayush", "comments": "Agent trying to approve with machine key"},
        headers=agent_auth_header,
    )
    assert res.status_code == 403
    assert any(phrase in res.json()["detail"].lower() for phrase in ["agent api credentials cannot authorize", "invalid human authorization token"])


@pytest.mark.asyncio
async def test_api_secret_key_cannot_complete(client, test_repo):
    """Security Invariant: Machine API_SECRET_KEY cannot authorize task completion."""
    task = test_repo.create_task(TaskCreate(title="T1", description="D1", reported_by="ayush"))
    _advance_task_to_awaiting_approval(test_repo, task.id)
    await client.post(
        f"/api/v1/tasks/{task.id}/approve",
        json={"reviewer_id": "ayush", "comments": "Approved"},
        headers=VALID_AUTH_HEADER,
    )

    agent_auth_header = {"Authorization": f"Bearer {settings.API_SECRET_KEY}"}
    res = await client.post(
        f"/api/v1/tasks/{task.id}/complete",
        headers=agent_auth_header,
    )
    assert res.status_code == 403
    assert any(phrase in res.json()["detail"].lower() for phrase in ["agent api credentials cannot authorize", "invalid human authorization token"])


@pytest.mark.asyncio
async def test_missing_human_secret_fails_closed(client, test_repo, monkeypatch):
    """Security Invariant: Missing HUMAN_APPROVAL_SECRET fails closed with 500 error, never falling back to API_SECRET_KEY."""
    task = test_repo.create_task(TaskCreate(title="T1", description="D1", reported_by="ayush"))
    _advance_task_to_awaiting_approval(test_repo, task.id)

    monkeypatch.setattr(settings, "HUMAN_APPROVAL_SECRET", "")
    res = await client.post(
        f"/api/v1/tasks/{task.id}/approve",
        json={"reviewer_id": "ayush", "comments": "Should fail closed"},
        headers={"Authorization": f"Bearer {settings.API_SECRET_KEY}"},
    )
    assert res.status_code == 500
    assert "human_approval_secret is unconfigured" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_agent_cannot_call_complete_directly(client, test_repo):
    """Security Invariant: Calling /complete without human credentials returns 401 Unauthorized."""
    task = test_repo.create_task(TaskCreate(title="T1", description="D1", reported_by="ayush"))
    res = await client.post(f"/api/v1/tasks/{task.id}/complete")
    assert res.status_code == 401
    assert "missing bearer token" in res.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 5: Valid human credential can approve a task awaiting approval (200)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_valid_human_credential_approves_task(client, test_repo):
    """Security Invariant: Valid Bearer token successfully authorizes task approval."""
    task = test_repo.create_task(TaskCreate(title="T1", description="D1", reported_by="ayush"))
    _advance_task_to_awaiting_approval(test_repo, task.id)

    res = await client.post(
        f"/api/v1/tasks/{task.id}/approve",
        json={"reviewer_id": "ayush", "comments": "Code reviewed and approved"},
        headers=VALID_AUTH_HEADER,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "APPROVED"


# ---------------------------------------------------------------------------
# Test 6 & 7: Agent cannot approve or complete through generic /transitions (400)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_agent_cannot_approve_through_transitions_endpoint(client, test_repo):
    """Security Invariant: Attempting target_status 'APPROVED' via /transitions returns 400."""
    task = test_repo.create_task(TaskCreate(title="T1", description="D1", reported_by="ayush"))
    _advance_task_to_awaiting_approval(test_repo, task.id)

    res = await client.post(
        f"/api/v1/tasks/{task.id}/transitions",
        headers=VALID_AGENT_HEADER,
        json={"target_status": "APPROVED", "actor_type": "agent", "actor_id": "switch-agent"},
    )
    assert res.status_code == 400
    assert "direct transition to 'approved' via /transitions is forbidden" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_agent_cannot_complete_through_transitions_endpoint(client, test_repo):
    """Security Invariant: Attempting target_status 'COMPLETED' via /transitions returns 400."""
    task = test_repo.create_task(TaskCreate(title="T1", description="D1", reported_by="ayush"))
    _advance_task_to_awaiting_approval(test_repo, task.id)

    res = await client.post(
        f"/api/v1/tasks/{task.id}/transitions",
        headers=VALID_AGENT_HEADER,
        json={"target_status": "COMPLETED", "actor_type": "agent", "actor_id": "switch-agent"},
    )
    assert res.status_code == 400
    assert "direct transition to 'completed' via /transitions is forbidden" in res.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 8: Human cannot complete an unapproved task (409 Conflict)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_human_cannot_complete_unapproved_task(client, test_repo):
    """Security Invariant: /complete rejects tasks that are not yet in APPROVED status."""
    task = test_repo.create_task(TaskCreate(title="T1", description="D1", reported_by="ayush"))
    # Task is still in REPORTED status
    res = await client.post(
        f"/api/v1/tasks/{task.id}/complete",
        headers=VALID_AUTH_HEADER,
    )
    assert res.status_code == 409
    assert "must be in 'approved' status" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_human_completes_approved_task_successfully(client, test_repo):
    """Verify that an approved task can be marked COMPLETED by authenticated human."""
    task = test_repo.create_task(TaskCreate(title="T1", description="D1", reported_by="ayush"))
    _advance_task_to_awaiting_approval(test_repo, task.id)

    # Approve task
    await client.post(
        f"/api/v1/tasks/{task.id}/approve",
        json={"reviewer_id": "ayush", "comments": "Approved"},
        headers=VALID_AUTH_HEADER,
    )

    # Complete task
    res = await client.post(
        f"/api/v1/tasks/{task.id}/complete",
        headers=VALID_AUTH_HEADER,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "COMPLETED"


# ---------------------------------------------------------------------------
# Test 9: Existing valid agent transitions continue working
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_existing_valid_agent_transitions_work(client, test_repo):
    """Verify standard agent transitions (REPORTED -> TRIAGED) function normally."""
    task_res = await client.post(
        "/api/v1/tasks",
        json={"title": "Agent Task", "description": "Desc", "reported_by": "ayush"},
    )
    task_id = task_res.json()["id"]

    res = await client.post(
        f"/api/v1/tasks/{task_id}/transitions",
        headers=VALID_AGENT_HEADER,
        json={"target_status": "TRIAGED", "actor_type": "agent", "actor_id": "switch-triage"},
    )
    assert res.status_code == 200
    assert res.json()["to_status"] == "TRIAGED"


# ---------------------------------------------------------------------------
# Test 10: Existing rejection and failure-recovery flows remain functional
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_rejection_flow_returns_to_fix_proposed(client, test_repo):
    """Verify human rejection records feedback and bounces task back to FIX_PROPOSED."""
    task = test_repo.create_task(TaskCreate(title="T1", description="D1", reported_by="ayush"))
    _advance_task_to_awaiting_approval(test_repo, task.id)

    reject_res = await client.post(
        f"/api/v1/tasks/{task.id}/reject",
        json={"reviewer_id": "ayush", "feedback": "Memory leak detected", "return_to": "FIX_PROPOSED"},
        headers=VALID_AUTH_HEADER,
    )
    assert reject_res.status_code == 200
    assert reject_res.json()["status"] == "FIX_PROPOSED"

    # Agent can now re-submit fix
    trans_res = await client.post(
        f"/api/v1/tasks/{task.id}/transitions",
        headers=VALID_AGENT_HEADER,
        json={"target_status": "VERIFYING", "actor_type": "agent", "actor_id": "switch-fix-agent"},
    )
    assert trans_res.status_code == 200
    assert trans_res.json()["to_status"] == "VERIFYING"


# ---------------------------------------------------------------------------
# General Task CRUD & Evidence tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_create_and_get_task_api(client):
    payload = {
        "title": "Wispr Flow punctuation bug",
        "description": "Dictation dropped exclamation marks",
        "reported_by": "ayush",
        "input_source": "wispr_flow",
    }
    create_res = await client.post("/api/v1/tasks", json=payload)
    assert create_res.status_code == 201
    task_data = create_res.json()
    assert task_data["id"].startswith("task_")
    assert task_data["status"] == "REPORTED"

    get_res = await client.get(f"/api/v1/tasks/{task_data['id']}")
    assert get_res.status_code == 200
    assert get_res.json()["title"] == payload["title"]


@pytest.mark.asyncio
async def test_get_nonexistent_task_returns_404(client):
    res = await client.get("/api/v1/tasks/task_doesnotexist")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_list_tasks_filtering_api(client):
    await client.post("/api/v1/tasks", json={"title": "Task 1", "description": "D1", "reported_by": "ayush"})
    await client.post("/api/v1/tasks", json={"title": "Task 2", "description": "D2", "reported_by": "pratham"})
    res = await client.get("/api/v1/tasks?status=REPORTED")
    assert res.status_code == 200
    assert all(t["status"] == "REPORTED" for t in res.json())


@pytest.mark.asyncio
async def test_evidence_recording_and_listing_api(client):
    task_res = await client.post(
        "/api/v1/tasks", json={"title": "Repro Task", "description": "Desc", "reported_by": "ayush"}
    )
    task_id = task_res.json()["id"]

    ev_payload = {
        "stage": "reproduction",
        "command_executed": "pytest tests/repro.py",
        "exit_code": 1,
        "stdout": "AssertionError: 500 != 200",
        "is_mock": False,
    }
    ev_res = await client.post(f"/api/v1/tasks/{task_id}/evidence", json=ev_payload)
    assert ev_res.status_code == 201

    list_res = await client.get(f"/api/v1/tasks/{task_id}/evidence")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1


@pytest.mark.asyncio
async def test_invalid_state_transition_returns_422(client):
    task_res = await client.post(
        "/api/v1/tasks", json={"title": "Invalid Task", "description": "Desc", "reported_by": "ayush"}
    )
    task_id = task_res.json()["id"]

    # Invalid jump: REPORTED directly to REPRODUCED
    res = await client.post(
        f"/api/v1/tasks/{task_id}/transitions",
        headers=VALID_AGENT_HEADER,
        json={"target_status": "REPRODUCED", "actor_type": "agent", "actor_id": "agent-1"},
    )
    assert res.status_code == 422
