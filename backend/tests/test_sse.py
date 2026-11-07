"""Integration and unit tests for Server-Sent Events (SSE) task streaming."""

import asyncio
import json
import pytest
import httpx

from app.api.deps import get_repository
from app.core.config import settings
from app.core.events import format_sse, format_heartbeat, event_broadcaster
from app.core.state_machine import CallerType, TaskStatus
from app.db.session import init_db
from app.main import app
from app.models.task import (
    EvidenceCreate,
    TaskCreate,
    TransitionRequest,
)
from app.repositories.task_repository import TaskRepository


VALID_TOKEN = settings.HUMAN_APPROVAL_SECRET
VALID_AUTH_HEADER = {"Authorization": f"Bearer {VALID_TOKEN}"}


@pytest.fixture
def sse_repo(tmp_path):
    """Provide a dedicated TaskRepository with an isolated SQLite DB for SSE tests."""
    db_file = str(tmp_path / "test_sse_shipdev.db")
    init_db(db_file)
    return TaskRepository(db_path=db_file)


@pytest.fixture
def sse_client(sse_repo):
    """Provide an HTTPX AsyncClient wired to sse_repo."""
    app.dependency_overrides[get_repository] = lambda: sse_repo
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://test")
    yield client
    app.dependency_overrides.clear()


def _parse_sse_events(text: str):
    """Parse raw SSE text into list of dicts: {'id': ..., 'event': ..., 'data': dict}."""
    blocks = text.strip().split("\n\n")
    events = []
    for block in blocks:
        if not block.strip() or block.strip().startswith(":"):
            continue
        ev = {}
        for line in block.split("\n"):
            if line.startswith("id:"):
                ev["id"] = line[3:].strip()
            elif line.startswith("event:"):
                ev["event"] = line[6:].strip()
            elif line.startswith("data:"):
                ev["data"] = json.loads(line[5:].strip())
        if ev:
            events.append(ev)
    return events


def _advance_to_awaiting_approval(repo: TaskRepository, task_id: str) -> None:
    """Helper to advance task to AWAITING_HUMAN_APPROVAL."""
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


@pytest.mark.asyncio
async def test_sse_invalid_task_returns_404(sse_client):
    """Verify connecting to SSE stream for a non-existent task returns 404."""
    resp = await sse_client.get("/api/v1/tasks/task_nonexistent_xyz/events")
    assert resp.status_code == 404
    body = resp.json()
    assert "not found" in body["detail"].lower()


@pytest.mark.asyncio
async def test_sse_replay_all_and_last_event_id(sse_repo, sse_client):
    """Verify missed events replay correctly via replay_all and last_event_id."""
    # Create task and record transitions
    task = sse_repo.create_task(TaskCreate(title="Bug A", description="Desc", reported_by="user"))
    task_id = task.id

    t1 = sse_repo.record_transition(
        task_id,
        TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.AGENT, actor_id="agent1"),
    )
    t2 = sse_repo.record_transition(
        task_id,
        TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.AGENT, actor_id="agent1"),
    )

    # 1. Connect with replay_all=true -> should receive t1 and t2
    resp = await sse_client.get(f"/api/v1/tasks/{task_id}/events?replay_all=true&max_events=2")
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]
    events = _parse_sse_events(resp.text)

    assert len(events) == 2
    assert events[0]["id"] == t1.id
    assert events[0]["event"] == "task_transition"
    assert events[0]["data"]["from_status"] == "REPORTED"
    assert events[0]["data"]["to_status"] == "TRIAGED"
    assert events[1]["id"] == t2.id
    assert events[1]["event"] == "task_transition"
    assert events[1]["data"]["from_status"] == "TRIAGED"
    assert events[1]["data"]["to_status"] == "REPRODUCING"

    # 2. Connect with Last-Event-ID header set to t1.id -> should only receive t2
    resp2 = await sse_client.get(
        f"/api/v1/tasks/{task_id}/events?max_events=1",
        headers={"Last-Event-ID": t1.id},
    )
    assert resp2.status_code == 200
    events2 = _parse_sse_events(resp2.text)
    assert len(events2) == 1
    assert events2[0]["id"] == t2.id
    assert events2[0]["data"]["to_status"] == "REPRODUCING"

    # 3. Connect with ?last_event_id= query parameter set to t1.id
    resp3 = await sse_client.get(
        f"/api/v1/tasks/{task_id}/events?last_event_id={t1.id}&max_events=1",
    )
    assert resp3.status_code == 200
    events3 = _parse_sse_events(resp3.text)
    assert len(events3) == 1
    assert events3[0]["id"] == t2.id


@pytest.mark.asyncio
async def test_sse_realtime_event_delivery(sse_repo, sse_client):
    """Verify live transitions are broadcast in real-time to active SSE streams."""
    task = sse_repo.create_task(TaskCreate(title="Bug Live", description="Desc", reported_by="user"))
    task_id = task.id

    # Launch stream request expecting 1 live event
    stream_task = asyncio.create_task(
        sse_client.get(f"/api/v1/tasks/{task_id}/events?max_events=1")
    )
    # Allow subscriber registration
    await asyncio.sleep(0.05)

    # Trigger transition
    sse_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.TRIAGED,
            actor_type=CallerType.AGENT,
            actor_id="agent-triager",
            reason="Triage complete",
        ),
    )

    resp = await stream_task
    assert resp.status_code == 200
    events = _parse_sse_events(resp.text)
    assert len(events) == 1
    ev_data = events[0]["data"]
    assert ev_data["task_id"] == task_id
    assert ev_data["from_status"] == "REPORTED"
    assert ev_data["to_status"] == "TRIAGED"
    assert ev_data["actor_type"] == "agent"
    assert ev_data["actor_id"] == "agent-triager"
    assert ev_data["reason"] == "Triage complete"


@pytest.mark.asyncio
async def test_sse_concurrent_subscribers(sse_repo, sse_client):
    """Verify multiple concurrent subscribers to the same task all receive broadcast events."""
    task = sse_repo.create_task(TaskCreate(title="Concurrent", description="Desc", reported_by="user"))
    task_id = task.id

    sub1_task = asyncio.create_task(
        sse_client.get(f"/api/v1/tasks/{task_id}/events?max_events=1")
    )
    sub2_task = asyncio.create_task(
        sse_client.get(f"/api/v1/tasks/{task_id}/events?max_events=1")
    )

    for _ in range(50):
        if event_broadcaster.subscriber_count(task_id) == 2:
            break
        await asyncio.sleep(0.01)
    assert event_broadcaster.subscriber_count(task_id) == 2

    # Trigger transition
    sse_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.TRIAGED,
            actor_type=CallerType.AGENT,
            actor_id="agent-concurrent",
        ),
    )

    resp1, resp2 = await asyncio.gather(sub1_task, sub2_task)
    assert resp1.status_code == 200
    assert resp2.status_code == 200

    events1 = _parse_sse_events(resp1.text)
    events2 = _parse_sse_events(resp2.text)

    assert len(events1) == 1
    assert len(events2) == 1
    assert events1[0]["id"] == events2[0]["id"]
    assert events1[0]["data"]["to_status"] == "TRIAGED"

    # Subscriber queues cleaned up
    assert event_broadcaster.subscriber_count(task_id) == 0


@pytest.mark.asyncio
async def test_sse_uncommitted_transition_not_broadcast(sse_repo, sse_client):
    """Verify failed/rejected transitions (422) never broadcast events to subscribers."""
    task = sse_repo.create_task(TaskCreate(title="Uncommitted", description="Desc", reported_by="user"))
    task_id = task.id

    stream_task = asyncio.create_task(
        sse_client.get(f"/api/v1/tasks/{task_id}/events?max_events=1")
    )
    await asyncio.sleep(0.05)

    # Attempt an illegal transition (REPORTED -> APPROVED directly) via API
    resp = await sse_client.post(
        f"/api/v1/tasks/{task_id}/transitions",
        headers={"Authorization": f"Bearer {settings.API_SECRET_KEY}"},
        json={"target_status": "APPROVED", "actor_type": "agent", "actor_id": "bad-agent"},
    )
    assert resp.status_code in [400, 422]

    # Send a valid transition after the invalid one to satisfy max_events=1
    sse_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.TRIAGED,
            actor_type=CallerType.AGENT,
            actor_id="good-agent",
        ),
    )

    stream_resp = await stream_task
    assert stream_resp.status_code == 200
    events = _parse_sse_events(stream_resp.text)

    # The only event received must be the valid TRIAGED transition, never the rejected APPROVED one
    assert len(events) == 1
    assert events[0]["data"]["to_status"] == "TRIAGED"
    assert events[0]["data"]["from_status"] == "REPORTED"


@pytest.mark.asyncio
async def test_sse_no_secrets_exposed_in_human_approval_event(sse_repo, sse_client):
    """Verify human approval emits an event but does NOT leak authorization secrets or tokens."""
    task = sse_repo.create_task(TaskCreate(title="Secret Test", description="Desc", reported_by="user"))
    task_id = task.id
    _advance_to_awaiting_approval(sse_repo, task_id)

    stream_task = asyncio.create_task(
        sse_client.get(f"/api/v1/tasks/{task_id}/events?max_events=1")
    )
    await asyncio.sleep(0.05)

    # Trigger human approval via API with Bearer token and caller ID
    approve_resp = await sse_client.post(
        f"/api/v1/tasks/{task_id}/approve",
        headers={**VALID_AUTH_HEADER, "X-Caller-ID": "ayush_sec"},
        json={"reviewer_id": "ayush_sec", "comments": "Approved after manual audit"},
    )
    assert approve_resp.status_code == 200

    stream_resp = await stream_task
    raw_text = stream_resp.text
    events = _parse_sse_events(raw_text)

    assert len(events) == 1
    ev_data = events[0]["data"]
    assert ev_data["to_status"] == "APPROVED"
    assert ev_data["actor_type"] == "human"
    assert "demo-human-proxy" in ev_data["actor_id"]
    assert "ayush_sec" in ev_data["actor_id"]

    # Verify strict absence of secrets
    assert VALID_TOKEN not in raw_text
    assert settings.API_SECRET_KEY not in raw_text
    assert "Authorization" not in raw_text
    assert "secret" not in json.dumps(ev_data).lower()


@pytest.mark.asyncio
async def test_sse_heartbeat_generation(sse_repo, sse_client, monkeypatch):
    """Verify periodic SSE ping comments are sent on timeout."""
    task = sse_repo.create_task(TaskCreate(title="Heartbeat Test", description="Desc", reported_by="user"))
    task_id = task.id

    # Temporarily set heartbeat interval to 0.05s and stream with timeout=0.12s
    monkeypatch.setattr(settings, "SSE_HEARTBEAT_INTERVAL", 0.05)

    resp = await sse_client.get(f"/api/v1/tasks/{task_id}/events?timeout=0.12")
    assert resp.status_code == 200
    assert ": ping -" in resp.text


@pytest.mark.asyncio
async def test_sse_reconnect_recovers_missed_events(sse_repo, sse_client):
    """Verify a client recovering from a disconnect can replay all missed transitions."""
    task = sse_repo.create_task(TaskCreate(title="Reconnect Test", description="Desc", reported_by="user"))
    task_id = task.id

    # Step 1: Initial session - receives first event
    t1 = sse_repo.record_transition(
        task_id,
        TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.AGENT, actor_id="a1"),
    )

    resp1 = await sse_client.get(f"/api/v1/tasks/{task_id}/events?replay_all=true&max_events=1")
    ev1 = _parse_sse_events(resp1.text)[0]
    last_received_id = ev1["id"]
    assert last_received_id == t1.id

    # Step 2: Client is offline. Two transitions occur in the background
    t2 = sse_repo.record_transition(
        task_id,
        TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.AGENT, actor_id="a1"),
    )
    ev_evidence = sse_repo.add_evidence(
        task_id, EvidenceCreate(stage="repro", command_executed="cmd", exit_code=1, is_mock=False)
    )
    t3 = sse_repo.record_transition(
        task_id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCED,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=ev_evidence.id,
        ),
    )

    # Step 3: Client reconnects using Last-Event-ID header
    resp2 = await sse_client.get(
        f"/api/v1/tasks/{task_id}/events?max_events=2",
        headers={"Last-Event-ID": last_received_id},
    )
    assert resp2.status_code == 200
    replayed = _parse_sse_events(resp2.text)

    assert len(replayed) == 2
    assert replayed[0]["id"] == t2.id
    assert replayed[0]["data"]["to_status"] == "REPRODUCING"
    assert replayed[1]["id"] == t3.id
    assert replayed[1]["data"]["to_status"] == "REPRODUCED"
    assert replayed[1]["data"]["evidence_id"] == ev_evidence.id
