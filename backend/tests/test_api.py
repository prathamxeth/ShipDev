"""End-to-end integration tests for ShipDev REST APIs and human approval gates."""

import pytest
import httpx
from app.api.deps import get_repository
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


@pytest.mark.asyncio
async def test_create_and_get_task_api(client):
    """Verify POST /api/v1/tasks and GET /api/v1/tasks/{id}."""
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
    assert task_data["input_source"] == "wispr_flow"

    task_id = task_data["id"]
    get_res = await client.get(f"/api/v1/tasks/{task_id}")
    assert get_res.status_code == 200
    assert get_res.json()["title"] == payload["title"]


@pytest.mark.asyncio
async def test_get_nonexistent_task_returns_404(client):
    """Verify GET /api/v1/tasks/{nonexistent} returns 404 Not Found."""
    res = await client.get("/api/v1/tasks/task_doesnotexist")
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_list_tasks_filtering_api(client):
    """Verify GET /api/v1/tasks with ?status query parameter."""
    await client.post(
        "/api/v1/tasks",
        json={"title": "Task 1", "description": "D1", "reported_by": "ayush"},
    )
    await client.post(
        "/api/v1/tasks",
        json={"title": "Task 2", "description": "D2", "reported_by": "pratham"},
    )

    all_res = await client.get("/api/v1/tasks")
    assert all_res.status_code == 200
    assert len(all_res.json()) >= 2

    filter_res = await client.get("/api/v1/tasks?status=REPORTED")
    assert filter_res.status_code == 200
    assert all(t["status"] == "REPORTED" for t in filter_res.json())


@pytest.mark.asyncio
async def test_evidence_recording_and_listing_api(client):
    """Verify POST /api/v1/tasks/{id}/evidence and GET /api/v1/tasks/{id}/evidence."""
    task_res = await client.post(
        "/api/v1/tasks",
        json={"title": "Repro Task", "description": "Desc", "reported_by": "ayush"},
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
    ev_data = ev_res.json()
    assert ev_data["id"].startswith("ev_")
    assert ev_data["exit_code"] == 1

    list_res = await client.get(f"/api/v1/tasks/{task_id}/evidence")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1


@pytest.mark.asyncio
async def test_state_transition_api(client):
    """Verify POST /api/v1/tasks/{id}/transitions and history retrieval."""
    task_res = await client.post(
        "/api/v1/tasks",
        json={"title": "Transition Task", "description": "Desc", "reported_by": "ayush"},
    )
    task_id = task_res.json()["id"]

    # Valid transition to TRIAGED
    headers = {"X-Caller-Type": "agent", "X-Caller-ID": "switch-triage"}
    trans_payload = {
        "target_status": "TRIAGED",
        "actor_type": "agent",
        "actor_id": "switch-triage",
        "reason": "Categorized",
    }
    res = await client.post(f"/api/v1/tasks/{task_id}/transitions", json=trans_payload, headers=headers)
    assert res.status_code == 200
    assert res.json()["to_status"] == "TRIAGED"

    # Verify history endpoint
    hist_res = await client.get(f"/api/v1/tasks/{task_id}/history")
    assert hist_res.status_code == 200
    assert len(hist_res.json()) == 1
    assert hist_res.json()[0]["to_status"] == "TRIAGED"


@pytest.mark.asyncio
async def test_invalid_state_transition_returns_422(client):
    """Verify invalid transition path returns 422 Unprocessable Entity."""
    task_res = await client.post(
        "/api/v1/tasks",
        json={"title": "Invalid Task", "description": "Desc", "reported_by": "ayush"},
    )
    task_id = task_res.json()["id"]

    # Invalid jump: REPORTED directly to APPROVED
    headers = {"X-Caller-Type": "human", "X-Caller-ID": "ayush"}
    trans_payload = {
        "target_status": "APPROVED",
        "actor_type": "human",
        "actor_id": "ayush",
    }
    res = await client.post(f"/api/v1/tasks/{task_id}/transitions", json=trans_payload, headers=headers)
    assert res.status_code == 422
    assert "invalid state transition" in res.json()["error"].lower()


@pytest.mark.asyncio
async def test_agent_approval_forbidden_403(client):
    """Security Invariant: AI agents cannot approve tasks via POST /approve."""
    task_res = await client.post(
        "/api/v1/tasks",
        json={"title": "Gated Task", "description": "Desc", "reported_by": "ayush"},
    )
    task_id = task_res.json()["id"]

    # Advance to AWAITING_HUMAN_APPROVAL using backend repository directly
    test_repo = app.dependency_overrides[get_repository]()
    test_repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.AGENT, actor_id="a1")
    )
    test_repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.AGENT, actor_id="a1")
    )
    ev1 = test_repo.add_evidence(
        task_id, EvidenceCreate(stage="repro", command_executed="cmd", exit_code=1, is_mock=False)
    )
    test_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCED, actor_type=CallerType.AGENT, actor_id="a1", evidence_id=ev1.id
        ),
    )
    test_repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.FIX_PROPOSED, actor_type=CallerType.AGENT, actor_id="a1")
    )
    test_repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.VERIFYING, actor_type=CallerType.AGENT, actor_id="a1")
    )
    ev2 = test_repo.add_evidence(
        task_id, EvidenceCreate(stage="verify", command_executed="cmd", exit_code=0, patch_diff="+ fix", is_mock=False)
    )
    test_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.AWAITING_HUMAN_APPROVAL,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=ev2.id,
        ),
    )

    # Agent attempts approval
    agent_headers = {"X-Caller-Type": "agent", "X-Caller-ID": "switch-agent-1"}
    appr_res = await client.post(
        f"/api/v1/tasks/{task_id}/approve",
        json={"reviewer_id": "switch-agent-1", "comments": "Self-approved"},
        headers=agent_headers,
    )
    assert appr_res.status_code == 403
    assert "human authorization" in appr_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_human_approval_and_rejection_flow(client):
    """Verify human approval succeeds and human rejection returns task to FIX_PROPOSED."""
    task_res = await client.post(
        "/api/v1/tasks",
        json={"title": "Review Task", "description": "Desc", "reported_by": "ayush"},
    )
    task_id = task_res.json()["id"]

    # Advance to AWAITING_HUMAN_APPROVAL
    test_repo = app.dependency_overrides[get_repository]()
    test_repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.AGENT, actor_id="a1")
    )
    test_repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.AGENT, actor_id="a1")
    )
    ev1 = test_repo.add_evidence(
        task_id, EvidenceCreate(stage="repro", command_executed="cmd", exit_code=1, is_mock=False)
    )
    test_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCED, actor_type=CallerType.AGENT, actor_id="a1", evidence_id=ev1.id
        ),
    )
    test_repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.FIX_PROPOSED, actor_type=CallerType.AGENT, actor_id="a1")
    )
    test_repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.VERIFYING, actor_type=CallerType.AGENT, actor_id="a1")
    )
    ev2 = test_repo.add_evidence(
        task_id, EvidenceCreate(stage="verify", command_executed="cmd", exit_code=0, patch_diff="+ fix", is_mock=False)
    )
    test_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.AWAITING_HUMAN_APPROVAL,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=ev2.id,
        ),
    )

    # 1. Human Rejection
    human_headers = {"X-Caller-Type": "human", "X-Caller-ID": "ayush"}
    reject_res = await client.post(
        f"/api/v1/tasks/{task_id}/reject",
        json={"reviewer_id": "ayush", "feedback": "Regressions found in billing", "return_to": "FIX_PROPOSED"},
        headers=human_headers,
    )
    assert reject_res.status_code == 200
    assert reject_res.json()["status"] == "FIX_PROPOSED"

    # Progress back to AWAITING_HUMAN_APPROVAL
    test_repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.VERIFYING, actor_type=CallerType.AGENT, actor_id="a1")
    )
    ev3 = test_repo.add_evidence(
        task_id,
        EvidenceCreate(stage="verify", command_executed="cmd2", exit_code=0, patch_diff="+ fix2", is_mock=False),
    )
    test_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.AWAITING_HUMAN_APPROVAL,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=ev3.id,
        ),
    )

    # 2. Human Approval
    appr_res = await client.post(
        f"/api/v1/tasks/{task_id}/approve",
        json={"reviewer_id": "ayush", "comments": "Fix verified, looks solid."},
        headers=human_headers,
    )
    assert appr_res.status_code == 200
    assert appr_res.json()["status"] == "APPROVED"

    # 3. Check approvals audit endpoint
    approvals_res = await client.get(f"/api/v1/tasks/{task_id}/approvals")
    assert approvals_res.status_code == 200
    records = approvals_res.json()
    assert len(records) == 2
    assert records[0]["decision"] == "rejected"
    assert records[1]["decision"] == "approved"

