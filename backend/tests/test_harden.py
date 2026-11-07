"""P0 Security Hardening regression tests."""

import asyncio
import json
import pytest
import httpx

from app.api.deps import get_repository, DEMO_HUMAN_IDENTITY_PREFIX
from app.core.config import Settings, settings
from app.core.events import EventBroadcaster, format_sse
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


VALID_HUMAN_HEADER = {"Authorization": f"Bearer {settings.HUMAN_APPROVAL_SECRET}"}
VALID_AGENT_HEADER = {"Authorization": f"Bearer {settings.API_SECRET_KEY}"}


@pytest.fixture
def harden_repo(tmp_path):
    """Isolated repository for hardening tests."""
    db_file = str(tmp_path / "test_harden_shipdev.db")
    init_db(db_file)
    return TaskRepository(db_path=db_file)


@pytest.fixture
def harden_client(harden_repo):
    """Isolated client with dependency override."""
    app.dependency_overrides[get_repository] = lambda: harden_repo
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    yield client
    app.dependency_overrides.clear()


def _advance_to_awaiting_approval(repo: TaskRepository, task_id: str) -> None:
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
            target_status=TaskStatus.REPRODUCED,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=ev1.id,
        ),
    )
    repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.FIX_PROPOSED, actor_type=CallerType.AGENT, actor_id="a1")
    )
    repo.record_transition(
        task_id, TransitionRequest(target_status=TaskStatus.VERIFYING, actor_type=CallerType.AGENT, actor_id="a1")
    )
    ev2 = repo.add_evidence(
        task_id,
        EvidenceCreate(stage="verify", command_executed="verify_cmd", exit_code=0, patch_diff="diff", is_mock=False),
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
# Test 1 & 2: Production credential validation & placeholder rejection
# ---------------------------------------------------------------------------
def test_missing_production_secrets_cannot_activate_defaults():
    """Verify missing secrets in production fail validation and cannot fall back to defaults."""
    with pytest.raises(ValueError, match="API_SECRET_KEY is required in production"):
        Settings(ENVIRONMENT="production", API_SECRET_KEY=None, HUMAN_APPROVAL_SECRET="prod-secret-999")

    with pytest.raises(ValueError, match="HUMAN_APPROVAL_SECRET is required in production"):
        Settings(ENVIRONMENT="production", API_SECRET_KEY="prod-agent-key-999", HUMAN_APPROVAL_SECRET=None)


def test_placeholder_production_credentials_are_rejected():
    """Verify development placeholder secrets are strictly rejected in production."""
    with pytest.raises(ValueError, match="cannot use known development placeholder"):
        Settings(
            ENVIRONMENT="production",
            API_SECRET_KEY="dev-agent-secret-change-in-production",
            HUMAN_APPROVAL_SECRET="valid-production-secret-12345",
        )

    with pytest.raises(ValueError, match="cannot use known development placeholder"):
        Settings(
            ENVIRONMENT="production",
            API_SECRET_KEY="valid-production-agent-key-12345",
            HUMAN_APPROVAL_SECRET="dev-human-secret-change-in-production",
        )


# ---------------------------------------------------------------------------
# Test 3 & 4: Reviewer identity spoofing protection
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_x_caller_id_cannot_establish_verified_identity(harden_client, harden_repo):
    """Verify X-Caller-ID is untrusted and recorded strictly as an unverified demo proxy claim."""
    task = harden_repo.create_task(TaskCreate(title="Spoof Test", description="Desc", reported_by="user"))
    _advance_to_awaiting_approval(harden_repo, task.id)

    resp = await harden_client.post(
        f"/api/v1/tasks/{task.id}/approve",
        headers={**VALID_HUMAN_HEADER, "X-Caller-ID": "elon_musk"},
        json={"reviewer_id": "ignored_id", "comments": "Claimed approval"},
    )
    assert resp.status_code == 200

    # Inspect persistent approval record
    appr_records = harden_repo.get_approval_records_for_task(task.id)
    assert len(appr_records) == 1
    # Identity must NOT be trusted as 'elon_musk'
    assert appr_records[0].reviewer_id != "elon_musk"
    assert appr_records[0].reviewer_id == f"{DEMO_HUMAN_IDENTITY_PREFIX}:claimed-elon_musk"

    # Inspect transition record
    transitions = harden_repo.get_transitions_for_task(task.id)
    approved_tr = [t for t in transitions if t.to_status == TaskStatus.APPROVED][0]
    assert approved_tr.actor_id != "elon_musk"
    assert approved_tr.actor_id == f"{DEMO_HUMAN_IDENTITY_PREFIX}:claimed-elon_musk"


@pytest.mark.asyncio
async def test_payload_reviewer_id_cannot_override_authenticated_identity(harden_client, harden_repo):
    """Verify payload.reviewer_id is rejected and cannot override authenticated identity."""
    task = harden_repo.create_task(TaskCreate(title="Payload Spoof", description="Desc", reported_by="user"))
    _advance_to_awaiting_approval(harden_repo, task.id)

    resp = await harden_client.post(
        f"/api/v1/tasks/{task.id}/approve",
        headers=VALID_HUMAN_HEADER,  # No X-Caller-ID provided
        json={"reviewer_id": "spoofed_admin", "comments": "Bypass attempt"},
    )
    assert resp.status_code == 200

    appr_records = harden_repo.get_approval_records_for_task(task.id)
    assert len(appr_records) == 1
    # Payload reviewer_id was rejected as identity source
    assert appr_records[0].reviewer_id != "spoofed_admin"
    assert appr_records[0].reviewer_id == DEMO_HUMAN_IDENTITY_PREFIX


# ---------------------------------------------------------------------------
# Test 5, 6, 7 & 8: Machine credential enforcement & isolation
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_missing_agent_credentials_are_rejected(harden_client, harden_repo):
    """Verify protected agent transitions reject missing credentials with 401."""
    task = harden_repo.create_task(TaskCreate(title="Agent Auth", description="Desc", reported_by="user"))

    resp = await harden_client.post(
        f"/api/v1/tasks/{task.id}/transitions",
        json={"target_status": "TRIAGED", "actor_type": "agent", "actor_id": "unauth-agent"},
    )
    assert resp.status_code == 401
    assert "missing agent credentials" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_invalid_agent_credentials_are_rejected(harden_client, harden_repo):
    """Verify protected agent transitions reject invalid credentials with 403."""
    task = harden_repo.create_task(TaskCreate(title="Agent Auth", description="Desc", reported_by="user"))

    resp = await harden_client.post(
        f"/api/v1/tasks/{task.id}/transitions",
        headers={"Authorization": "Bearer totally-invalid-key"},
        json={"target_status": "TRIAGED", "actor_type": "agent", "actor_id": "agent1"},
    )
    assert resp.status_code == 403
    assert "invalid agent api key" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_human_credentials_cannot_authorize_machine_only_operations(harden_client, harden_repo):
    """Verify human approval credentials cannot substitute for agent API key."""
    task = harden_repo.create_task(TaskCreate(title="Cross Auth", description="Desc", reported_by="user"))

    resp = await harden_client.post(
        f"/api/v1/tasks/{task.id}/transitions",
        headers={"Authorization": f"Bearer {settings.HUMAN_APPROVAL_SECRET}"},
        json={"target_status": "TRIAGED", "actor_type": "agent", "actor_id": "agent1"},
    )
    assert resp.status_code == 403
    assert "human credentials cannot authorize machine-only operations" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_machine_credentials_cannot_approve_tasks(harden_client, harden_repo):
    """Verify agent API credentials cannot authorize human approval operations."""
    task = harden_repo.create_task(TaskCreate(title="Cross Auth 2", description="Desc", reported_by="user"))
    _advance_to_awaiting_approval(harden_repo, task.id)

    resp = await harden_client.post(
        f"/api/v1/tasks/{task.id}/approve",
        headers=VALID_AGENT_HEADER,
        json={"reviewer_id": "agent_masquerade", "comments": "Agent trying to approve"},
    )
    assert resp.status_code == 403
    assert "agent api credentials cannot authorize human approval" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 9 & 10: Queue overflow handling and persistent replay
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_queue_overflow_cannot_silently_lose_event(harden_repo):
    """Verify that queue saturation explicitly flags overflow without dropping queued events."""
    broadcaster = EventBroadcaster()
    task_id = "task_overflow_test"

    # Create subscriber with capacity of 1
    queue = broadcaster.subscribe(task_id, maxsize=1)

    event_1 = {"event_id": "tr_1", "task_id": task_id, "to_status": "TRIAGED"}
    event_2 = {"event_id": "tr_2", "task_id": task_id, "to_status": "REPRODUCING"}

    # Publish first event (fills queue)
    broadcaster.publish(task_id, event_1)
    assert queue.qsize() == 1
    assert queue.overflowed is False

    # Publish second event (triggers explicit overflow handling)
    broadcaster.publish(task_id, event_2)

    # Invariant: event_1 was NOT silently dropped/evicted
    assert queue.qsize() == 1
    peek_event = queue.get_nowait()
    assert peek_event["event_id"] == "tr_1"

    # Invariant: subscriber was explicitly marked as overflowed with unbuffered event ID
    assert queue.overflowed is True
    assert queue.overflow_event_id == "tr_2"


@pytest.mark.asyncio
async def test_replay_recovers_missed_transitions(harden_client, harden_repo):
    """Verify that when a client recovers from an overflow or disconnect, replay recovers all transitions."""
    task = harden_repo.create_task(TaskCreate(title="Replay Recovery", description="Desc", reported_by="user"))
    task_id = task.id

    # Commit 3 distinct lifecycle transitions
    t1 = harden_repo.record_transition(
        task_id,
        TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.AGENT, actor_id="a1"),
    )
    t2 = harden_repo.record_transition(
        task_id,
        TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.AGENT, actor_id="a1"),
    )
    ev = harden_repo.add_evidence(
        task_id, EvidenceCreate(stage="repro", command_executed="pytest", exit_code=1, is_mock=False)
    )
    t3 = harden_repo.record_transition(
        task_id,
        TransitionRequest(target_status=TaskStatus.REPRODUCED, actor_type=CallerType.AGENT, actor_id="a1", evidence_id=ev.id),
    )

    # Client reconnects with Last-Event-ID = t1.id
    resp = await harden_client.get(
        f"/api/v1/tasks/{task_id}/events?max_events=2",
        headers={"Last-Event-ID": t1.id},
    )
    assert resp.status_code == 200

    # Parse SSE text
    lines = resp.text.strip().split("\n\n")
    received_data = []
    for block in lines:
        for line in block.split("\n"):
            if line.startswith("data:"):
                received_data.append(json.loads(line[5:].strip()))

    assert len(received_data) == 2
    assert received_data[0]["event_id"] == t2.id
    assert received_data[0]["to_status"] == "REPRODUCING"
    assert received_data[1]["event_id"] == t3.id
    assert received_data[1]["to_status"] == "REPRODUCED"
    assert received_data[1]["evidence_id"] == ev.id


# ---------------------------------------------------------------------------
# Test 11: Configuration forbids identical machine and human secrets
# ---------------------------------------------------------------------------
def test_identical_production_secrets_rejected():
    """Verify that identical machine and human secrets fail closed in production."""
    with pytest.raises(ValueError, match="must be distinct secrets"):
        Settings(
            ENVIRONMENT="production",
            API_SECRET_KEY="shared-super-secret-key-12345",
            HUMAN_APPROVAL_SECRET="shared-super-secret-key-12345",
        )


# ---------------------------------------------------------------------------
# Test 12: Generic transitions payload.actor_id cannot override authenticated identity
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_transitions_payload_actor_id_cannot_override_authenticated_identity(harden_client, harden_repo):
    """Verify that an agent cannot forge its actor_id in the request payload."""
    task = harden_repo.create_task(TaskCreate(title="Actor Override", description="Desc", reported_by="user"))

    resp = await harden_client.post(
        f"/api/v1/tasks/{task.id}/transitions",
        headers={**VALID_AGENT_HEADER, "X-Caller-ID": "trusted-agent-1"},
        json={"target_status": "TRIAGED", "actor_type": "agent", "actor_id": "forged-admin"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["actor_id"] != "forged-admin"
    assert data["actor_id"] == "trusted-agent-1"


# ---------------------------------------------------------------------------
# Test 13: Transactional consistency with invalid evidence reference
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_nonexistent_evidence_reference_fails_closed(harden_client, harden_repo):
    """Verify that referencing non-existent evidence fails atomically without mutating state."""
    task = harden_repo.create_task(TaskCreate(title="Evidence Fail", description="Desc", reported_by="user"))
    harden_repo.record_transition(
        task.id, TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.AGENT, actor_id="a1")
    )
    harden_repo.record_transition(
        task.id, TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.AGENT, actor_id="a1")
    )

    # Attempt to transition to REPRODUCED referencing non-existent evidence ID
    resp = await harden_client.post(
        f"/api/v1/tasks/{task.id}/transitions",
        headers=VALID_AGENT_HEADER,
        json={"target_status": "REPRODUCED", "actor_type": "agent", "actor_id": "a1", "evidence_id": "ev_nonexistent_999"},
    )
    assert resp.status_code == 400
    assert "referenced evidence artifact 'ev_nonexistent_999' does not exist" in resp.json()["detail"].lower()

    # Task status remains unchanged
    refetched = harden_repo.get_task(task.id)
    assert refetched.status == TaskStatus.REPRODUCING

    # Transition history contains only the 2 prior transitions
    history = harden_repo.get_transitions_for_task(task.id)
    assert len(history) == 2


# ---------------------------------------------------------------------------
# Test 14: Zero secret or credential leakage across entire SSE lifecycle
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_zero_secrets_leak_in_sse_stream_across_full_lifecycle(harden_client, harden_repo):
    """Verify that no secrets, Bearer tokens, or authorization headers leak in SSE streams."""
    task = harden_repo.create_task(TaskCreate(title="SSE Leak Check", description="Desc", reported_by="user"))
    task_id = task.id
    _advance_to_awaiting_approval(harden_repo, task_id)

    # Human approves with secret token
    approve_resp = await harden_client.post(
        f"/api/v1/tasks/{task_id}/approve",
        headers={**VALID_HUMAN_HEADER, "X-Caller-ID": "auditor"},
        json={"reviewer_id": "auditor", "comments": "Approved after inspection"},
    )
    assert approve_resp.status_code == 200

    # Human completes with secret token
    complete_resp = await harden_client.post(
        f"/api/v1/tasks/{task_id}/complete",
        headers={**VALID_HUMAN_HEADER, "X-Caller-ID": "auditor"},
    )
    assert complete_resp.status_code == 200

    # Stream all 8 lifecycle events via replay_all
    sse_resp = await harden_client.get(f"/api/v1/tasks/{task_id}/events?replay_all=true&max_events=8")
    assert sse_resp.status_code == 200

    raw_stream = sse_resp.text
    assert settings.HUMAN_APPROVAL_SECRET not in raw_stream
    assert settings.API_SECRET_KEY not in raw_stream
    assert "Bearer" not in raw_stream
    assert "Authorization" not in raw_stream
    assert "dev-insecure-local" not in raw_stream


