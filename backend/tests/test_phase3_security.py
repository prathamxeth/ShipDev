"""
ShipDev Phase 3 Security Tests: Evidence Authorization, Cross-Task Binding, Immutability & Workspace Isolation.
"""

import os
import sys
import shutil
from pathlib import Path
import pytest
import httpx
from httpx import AsyncClient

PROJECT_ROOT_DIR = str(Path(__file__).resolve().parent.parent.parent)
if PROJECT_ROOT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_DIR)

from app.api.deps import get_repository
from app.core.config import settings
from app.core.state_machine import (
    CallerType,
    MissingEvidenceError,
    TaskStatus,
)
from app.db.session import init_db
from app.main import app
from app.models.task import (
    ApprovalRequest,
    EvidenceCreate,
    TaskCreate,
    TransitionRequest,
)
from app.repositories.task_repository import (
    TaskImmutableError,
    TaskRepository,
)
from scripts.run_agent_pipeline import (
    DEMO_DIR,
    DEMO_ORIGINAL,
    DEMO_WORKSPACES_ROOT,
    apply_patch_safely,
    cleanup_isolated_workspace,
    get_workspace_path,
    prepare_isolated_workspace,
    validate_path_identifier,
)


@pytest.fixture
def phase3_repo(tmp_path):
    """Provide a TaskRepository configured with an isolated test SQLite database."""
    db_file = str(tmp_path / "test_phase3_shipdev.db")
    init_db(db_file)
    return TaskRepository(db_path=db_file)


@pytest.fixture
def client(phase3_repo):
    """Provide an HTTPX AsyncClient with repository dependency overridden to phase3_repo."""
    app.dependency_overrides[get_repository] = lambda: phase3_repo
    transport = httpx.ASGITransport(app=app)
    yield httpx.AsyncClient(transport=transport, base_url="http://test")
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def cleanup_demo_workspaces():
    """Ensure clean workspaces root before and after each test."""
    if os.path.exists(DEMO_WORKSPACES_ROOT):
        shutil.rmtree(DEMO_WORKSPACES_ROOT)
    yield
    if os.path.exists(DEMO_WORKSPACES_ROOT):
        shutil.rmtree(DEMO_WORKSPACES_ROOT)


# ===========================================================================
# FIX 1: Evidence Submission Authentication Tests
# ===========================================================================

@pytest.mark.asyncio
async def test_fix1_missing_token_is_rejected(client: AsyncClient, phase3_repo: TaskRepository):
    """FIX 1: POST /tasks/{id}/evidence without credentials fails with 401 Unauthorized."""
    task = phase3_repo.create_task(TaskCreate(title="Bug 1", description="Desc", reported_by="user"))
    ev_payload = {
        "stage": "reproduction",
        "command_executed": "pytest demo/tests/test_calculator.py",
        "exit_code": 1,
        "stdout": "AssertionError",
        "is_mock": False,
    }
    res = await client.post(f"/api/v1/tasks/{task.id}/evidence", json=ev_payload)
    assert res.status_code == 401
    assert "missing agent credentials" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_fix1_invalid_token_is_rejected(client: AsyncClient, phase3_repo: TaskRepository):
    """FIX 1: POST /tasks/{id}/evidence with invalid bearer token fails with 403 Forbidden."""
    task = phase3_repo.create_task(TaskCreate(title="Bug 1", description="Desc", reported_by="user"))
    ev_payload = {
        "stage": "reproduction",
        "command_executed": "pytest demo/tests/test_calculator.py",
        "exit_code": 1,
        "stdout": "AssertionError",
        "is_mock": False,
    }
    res = await client.post(
        f"/api/v1/tasks/{task.id}/evidence",
        headers={"Authorization": "Bearer totally-invalid-token-xyz"},
        json=ev_payload,
    )
    assert res.status_code == 403
    assert "invalid agent api key or token" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_fix1_valid_agent_token_submits_evidence(client: AsyncClient, phase3_repo: TaskRepository):
    """FIX 1: POST /tasks/{id}/evidence with authentic agent secret succeeds with 201 Created."""
    task = phase3_repo.create_task(TaskCreate(title="Bug 1", description="Desc", reported_by="user"))
    ev_payload = {
        "stage": "reproduction",
        "command_executed": "pytest demo/tests/test_calculator.py",
        "exit_code": 1,
        "stdout": "AssertionError: 120.0 != 80.0",
        "is_mock": False,
    }
    agent_token = settings.API_SECRET_KEY
    assert agent_token, "API_SECRET_KEY must be configured"

    res = await client.post(
        f"/api/v1/tasks/{task.id}/evidence",
        headers={"Authorization": f"Bearer {agent_token}"},
        json=ev_payload,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["id"].startswith("ev_")
    assert data["task_id"] == task.id
    assert data["exit_code"] == 1


@pytest.mark.asyncio
async def test_fix1_human_credential_cannot_submit_agent_evidence(client: AsyncClient, phase3_repo: TaskRepository):
    """FIX 1: POST /tasks/{id}/evidence with human approval secret fails with 403 Forbidden."""
    task = phase3_repo.create_task(TaskCreate(title="Bug 1", description="Desc", reported_by="user"))
    ev_payload = {
        "stage": "reproduction",
        "command_executed": "pytest demo/tests/test_calculator.py",
        "exit_code": 1,
        "stdout": "AssertionError",
        "is_mock": False,
    }
    human_secret = settings.HUMAN_APPROVAL_SECRET
    assert human_secret, "HUMAN_APPROVAL_SECRET must be configured"

    res = await client.post(
        f"/api/v1/tasks/{task.id}/evidence",
        headers={"Authorization": f"Bearer {human_secret}"},
        json=ev_payload,
    )
    assert res.status_code == 403
    assert "human credentials cannot authorize machine-only operations" in res.json()["detail"].lower()


# ===========================================================================
# FIX 2: Cross-Task Evidence Replay Prevention Tests
# ===========================================================================

@pytest.mark.asyncio
async def test_fix2_task_a_evidence_can_be_used_by_task_a(client: AsyncClient, phase3_repo: TaskRepository):
    """FIX 2: Task A evidence can be used to advance Task A to REPRODUCED."""
    task_a = phase3_repo.create_task(TaskCreate(title="Task A", description="Desc A", reported_by="user"))
    agent_token = settings.API_SECRET_KEY

    # Advance Task A to REPRODUCING
    phase3_repo.record_transition(
        task_a.id,
        TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.AGENT, actor_id="a1"),
    )
    phase3_repo.record_transition(
        task_a.id,
        TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.AGENT, actor_id="a1"),
    )

    ev_a = phase3_repo.add_evidence(
        task_a.id,
        EvidenceCreate(
            stage="reproduction",
            command_executed="pytest demo/tests/test_calculator.py",
            exit_code=1,
            stdout="AssertionError",
            is_mock=False,
        ),
    )

    # Use Task A's evidence on Task A -> succeeds
    res = await client.post(
        f"/api/v1/tasks/{task_a.id}/transitions",
        headers={"Authorization": f"Bearer {agent_token}", "X-Caller-Type": "agent", "X-Caller-ID": "a1"},
        json={
            "target_status": "REPRODUCED",
            "actor_type": "agent",
            "actor_id": "a1",
            "evidence_id": ev_a.id,
        },
    )
    assert res.status_code == 200
    assert res.json()["to_status"] == "REPRODUCED"


@pytest.mark.asyncio
async def test_fix2_task_a_evidence_cannot_be_used_by_task_b(client: AsyncClient, phase3_repo: TaskRepository):
    """FIX 2: Replaying Task A evidence on Task B is rejected with HTTP 400 Bad Request."""
    task_a = phase3_repo.create_task(TaskCreate(title="Task A", description="Desc A", reported_by="user"))
    task_b = phase3_repo.create_task(TaskCreate(title="Task B", description="Desc B", reported_by="user"))
    agent_token = settings.API_SECRET_KEY

    # Advance Task B to REPRODUCING
    phase3_repo.record_transition(
        task_b.id,
        TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.AGENT, actor_id="a1"),
    )
    phase3_repo.record_transition(
        task_b.id,
        TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.AGENT, actor_id="a1"),
    )

    # Attach evidence to Task A
    ev_a = phase3_repo.add_evidence(
        task_a.id,
        EvidenceCreate(
            stage="reproduction",
            command_executed="pytest demo/tests/test_calculator.py",
            exit_code=1,
            stdout="AssertionError",
            is_mock=False,
        ),
    )

    # Attempt to use Task A's evidence on Task B -> fails with 400
    res = await client.post(
        f"/api/v1/tasks/{task_b.id}/transitions",
        headers={"Authorization": f"Bearer {agent_token}", "X-Caller-Type": "agent", "X-Caller-ID": "a1"},
        json={
            "target_status": "REPRODUCED",
            "actor_type": "agent",
            "actor_id": "a1",
            "evidence_id": ev_a.id,
        },
    )
    assert res.status_code == 400
    assert "belongs to task" in res.json()["detail"].lower()
    assert task_a.id in res.json()["detail"]


@pytest.mark.asyncio
async def test_fix2_nonexistent_evidence_id_is_rejected(client: AsyncClient, phase3_repo: TaskRepository):
    """FIX 2: Referencing a nonexistent evidence ID is rejected with HTTP 400 Bad Request."""
    task = phase3_repo.create_task(TaskCreate(title="Task 1", description="Desc", reported_by="user"))
    agent_token = settings.API_SECRET_KEY

    phase3_repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.TRIAGED, actor_type=CallerType.AGENT, actor_id="a1"),
    )
    phase3_repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.REPRODUCING, actor_type=CallerType.AGENT, actor_id="a1"),
    )

    res = await client.post(
        f"/api/v1/tasks/{task.id}/transitions",
        headers={"Authorization": f"Bearer {agent_token}", "X-Caller-Type": "agent", "X-Caller-ID": "a1"},
        json={
            "target_status": "REPRODUCED",
            "actor_type": "agent",
            "actor_id": "a1",
            "evidence_id": "ev_nonexistent_00000000",
        },
    )
    assert res.status_code == 400
    assert "does not exist" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_fix2_cross_task_evidence_cannot_advance_task_b_to_awaiting_approval(
    client: AsyncClient, phase3_repo: TaskRepository
):
    """FIX 2: Replaying valid verification evidence from Task A cannot advance Task B to AWAITING_HUMAN_APPROVAL."""
    task_a = phase3_repo.create_task(TaskCreate(title="Task A", description="Desc A", reported_by="user"))
    task_b = phase3_repo.create_task(TaskCreate(title="Task B", description="Desc B", reported_by="user"))
    agent_token = settings.API_SECRET_KEY

    # Advance Task B to VERIFYING
    for status in [TaskStatus.TRIAGED, TaskStatus.REPRODUCING]:
        phase3_repo.record_transition(
            task_b.id,
            TransitionRequest(target_status=status, actor_type=CallerType.AGENT, actor_id="a1"),
        )
    repro_b = phase3_repo.add_evidence(
        task_b.id,
        EvidenceCreate(
            stage="reproduction",
            command_executed="pytest demo/tests/test_calculator.py",
            exit_code=1,
            stdout="AssertionError",
            is_mock=False,
        ),
    )
    phase3_repo.record_transition(
        task_b.id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCED,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=repro_b.id,
        ),
    )
    for status in [TaskStatus.FIX_PROPOSED, TaskStatus.VERIFYING]:
        phase3_repo.record_transition(
            task_b.id,
            TransitionRequest(target_status=status, actor_type=CallerType.AGENT, actor_id="a1"),
        )

    # Attach genuine verification evidence to Task A
    ver_a = phase3_repo.add_evidence(
        task_a.id,
        EvidenceCreate(
            stage="verification",
            command_executed="pytest demo/tests/test_calculator.py",
            exit_code=0,
            stdout="3 passed",
            patch_diff="--- a/calc.py\n+++ b/calc.py\n@@ -1,1 +1,1 @@\n",
            is_mock=False,
        ),
    )

    # Attempt to advance Task B to AWAITING_HUMAN_APPROVAL using Task A's verification evidence
    res = await client.post(
        f"/api/v1/tasks/{task_b.id}/transitions",
        headers={"Authorization": f"Bearer {agent_token}", "X-Caller-Type": "agent", "X-Caller-ID": "a1"},
        json={
            "target_status": "AWAITING_HUMAN_APPROVAL",
            "actor_type": "agent",
            "actor_id": "a1",
            "evidence_id": ver_a.id,
        },
    )
    assert res.status_code == 400
    assert "belongs to task" in res.json()["detail"].lower()

    # Verify Task B status was NOT advanced
    task_b_fresh = phase3_repo.get_task(task_b.id)
    assert task_b_fresh.status == TaskStatus.VERIFYING


# ===========================================================================
# FIX 3: Evidence Mutation Prevention After Approval & Completion
# ===========================================================================

@pytest.mark.asyncio
async def test_fix3_evidence_can_be_added_before_approval(client: AsyncClient, phase3_repo: TaskRepository):
    """FIX 3: Evidence can be attached in valid pre-approval workflow states (e.g. REPORTED, REPRODUCING)."""
    task = phase3_repo.create_task(TaskCreate(title="Task Pre-Approval", description="Desc", reported_by="user"))
    agent_token = settings.API_SECRET_KEY

    ev_payload = {
        "stage": "reproduction",
        "command_executed": "pytest demo/tests/test_calculator.py",
        "exit_code": 1,
        "stdout": "AssertionError",
        "is_mock": False,
    }
    res = await client.post(
        f"/api/v1/tasks/{task.id}/evidence",
        headers={"Authorization": f"Bearer {agent_token}"},
        json=ev_payload,
    )
    assert res.status_code == 201
    assert res.json()["task_id"] == task.id


@pytest.mark.asyncio
async def test_fix3_evidence_cannot_be_added_after_approval(client: AsyncClient, phase3_repo: TaskRepository):
    """FIX 3: Attempting to attach evidence to an APPROVED task fails with HTTP 409 Conflict."""
    task = phase3_repo.create_task(TaskCreate(title="Task Approved", description="Desc", reported_by="user"))
    agent_token = settings.API_SECRET_KEY

    # Advance task to AWAITING_HUMAN_APPROVAL
    for st in [TaskStatus.TRIAGED, TaskStatus.REPRODUCING]:
        phase3_repo.record_transition(
            task.id,
            TransitionRequest(target_status=st, actor_type=CallerType.AGENT, actor_id="a1"),
        )
    repro_ev = phase3_repo.add_evidence(
        task.id,
        EvidenceCreate(stage="reproduction", command_executed="pytest", exit_code=1, is_mock=False),
    )
    phase3_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCED,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=repro_ev.id,
        ),
    )
    for st in [TaskStatus.FIX_PROPOSED, TaskStatus.VERIFYING]:
        phase3_repo.record_transition(
            task.id,
            TransitionRequest(target_status=st, actor_type=CallerType.AGENT, actor_id="a1"),
        )
    ver_ev = phase3_repo.add_evidence(
        task.id,
        EvidenceCreate(
            stage="verification",
            command_executed="pytest",
            exit_code=0,
            patch_diff="--- a\n+++ b\n",
            is_mock=False,
        ),
    )
    phase3_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.AWAITING_HUMAN_APPROVAL,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=ver_ev.id,
        ),
    )

    # Human approves the task
    phase3_repo.record_human_approval(
        task.id,
        ApprovalRequest(reviewer_id="human-reviewer", comments="LGTM"),
        actor_type=CallerType.HUMAN,
    )
    task_approved = phase3_repo.get_task(task.id)
    assert task_approved.status == TaskStatus.APPROVED

    # Now attempt to post new evidence -> must return 409 Conflict
    post_ev_payload = {
        "stage": "post_approval_tampering",
        "command_executed": "malicious_cmd",
        "exit_code": 0,
        "is_mock": False,
    }
    res = await client.post(
        f"/api/v1/tasks/{task.id}/evidence",
        headers={"Authorization": f"Bearer {agent_token}"},
        json=post_ev_payload,
    )
    assert res.status_code == 409
    assert "immutable" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_fix3_evidence_cannot_be_added_after_completion(client: AsyncClient, phase3_repo: TaskRepository):
    """FIX 3: Attempting to attach evidence to a COMPLETED task fails with HTTP 409 Conflict."""
    task = phase3_repo.create_task(TaskCreate(title="Task Completed", description="Desc", reported_by="user"))
    agent_token = settings.API_SECRET_KEY

    # Advance to AWAITING_HUMAN_APPROVAL
    for st in [TaskStatus.TRIAGED, TaskStatus.REPRODUCING]:
        phase3_repo.record_transition(
            task.id,
            TransitionRequest(target_status=st, actor_type=CallerType.AGENT, actor_id="a1"),
        )
    repro_ev = phase3_repo.add_evidence(
        task.id,
        EvidenceCreate(stage="reproduction", command_executed="pytest", exit_code=1, is_mock=False),
    )
    phase3_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.REPRODUCED,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=repro_ev.id,
        ),
    )
    for st in [TaskStatus.FIX_PROPOSED, TaskStatus.VERIFYING]:
        phase3_repo.record_transition(
            task.id,
            TransitionRequest(target_status=st, actor_type=CallerType.AGENT, actor_id="a1"),
        )
    ver_ev = phase3_repo.add_evidence(
        task.id,
        EvidenceCreate(
            stage="verification",
            command_executed="pytest",
            exit_code=0,
            patch_diff="--- a\n+++ b\n",
            is_mock=False,
        ),
    )
    phase3_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.AWAITING_HUMAN_APPROVAL,
            actor_type=CallerType.AGENT,
            actor_id="a1",
            evidence_id=ver_ev.id,
        ),
    )

    # Human approves and completes task
    phase3_repo.record_human_approval(
        task.id,
        ApprovalRequest(reviewer_id="human-reviewer", comments="Approved"),
        actor_type=CallerType.HUMAN,
    )
    phase3_repo.record_transition(
        task.id,
        TransitionRequest(
            target_status=TaskStatus.COMPLETED,
            actor_type=CallerType.HUMAN,
            actor_id="human-reviewer",
            reason="Done",
        ),
    )
    assert phase3_repo.get_task(task.id).status == TaskStatus.COMPLETED

    # Attempt to post evidence to completed task -> must return 409
    res = await client.post(
        f"/api/v1/tasks/{task.id}/evidence",
        headers={"Authorization": f"Bearer {agent_token}"},
        json={"stage": "tamper", "command_executed": "echo", "exit_code": 0, "is_mock": False},
    )
    assert res.status_code == 409
    assert "immutable" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_fix3_existing_evidence_remains_readable_after_approval_and_completion(
    client: AsyncClient, phase3_repo: TaskRepository
):
    """FIX 3: Historical evidence records remain fully readable (GET /tasks/{id}/evidence) after approval and completion."""
    task = phase3_repo.create_task(TaskCreate(title="Task History", description="Desc", reported_by="user"))

    # Attach two evidence records before approval
    ev1 = phase3_repo.add_evidence(
        task.id,
        EvidenceCreate(stage="reproduction", command_executed="pytest", exit_code=1, is_mock=False),
    )
    ev2 = phase3_repo.add_evidence(
        task.id,
        EvidenceCreate(stage="verification", command_executed="pytest -v", exit_code=0, patch_diff="diff", is_mock=False),
    )

    # Advance to approval and completion
    for st in [TaskStatus.TRIAGED, TaskStatus.REPRODUCING]:
        phase3_repo.record_transition(task.id, TransitionRequest(target_status=st, actor_type=CallerType.AGENT, actor_id="a1"))
    phase3_repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.REPRODUCED, actor_type=CallerType.AGENT, actor_id="a1", evidence_id=ev1.id),
    )
    for st in [TaskStatus.FIX_PROPOSED, TaskStatus.VERIFYING]:
        phase3_repo.record_transition(task.id, TransitionRequest(target_status=st, actor_type=CallerType.AGENT, actor_id="a1"))
    phase3_repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.AWAITING_HUMAN_APPROVAL, actor_type=CallerType.AGENT, actor_id="a1", evidence_id=ev2.id),
    )
    phase3_repo.record_human_approval(
        task.id,
        ApprovalRequest(reviewer_id="human", comments="OK"),
        actor_type=CallerType.HUMAN,
    )
    phase3_repo.record_transition(
        task.id,
        TransitionRequest(target_status=TaskStatus.COMPLETED, actor_type=CallerType.HUMAN, actor_id="human"),
    )

    # Read evidence list via API -> returns 200 with both evidence items
    res = await client.get(f"/api/v1/tasks/{task.id}/evidence")
    assert res.status_code == 200
    evidence_list = res.json()
    assert len(evidence_list) == 2
    assert {e["id"] for e in evidence_list} == {ev1.id, ev2.id}

    # Read individual evidence item via GET /evidence/{id} -> returns 200
    res_single = await client.get(f"/api/v1/evidence/{ev1.id}")
    assert res_single.status_code == 200
    assert res_single.json()["id"] == ev1.id


# ===========================================================================
# FIX 4: Workspace Isolation Tests
# ===========================================================================

def test_fix4_two_executions_receive_different_workspace_paths():
    """FIX 4: Two independent execution runs receive different, isolated workspace paths."""
    ws1 = get_workspace_path(execution_id="exec_run_1", task_id="task_100")
    ws2 = get_workspace_path(execution_id="exec_run_2", task_id="task_100")
    ws3 = get_workspace_path(execution_id="exec_run_1", task_id="task_200")

    assert ws1 != ws2
    assert ws1 != ws3
    assert ws2 != ws3
    assert os.path.basename(ws1) == "task_100_exec_run_1"
    assert os.path.basename(ws2) == "task_100_exec_run_2"
    assert os.path.basename(ws3) == "task_200_exec_run_1"


def test_fix4_both_executions_start_from_pristine_source():
    """FIX 4: Each execution workspace initializes with a pristine copy of demo/buggy_app."""
    ws1 = prepare_isolated_workspace(execution_id="exec_alpha", task_id="task_A")
    ws2 = prepare_isolated_workspace(execution_id="exec_beta", task_id="task_B")

    file1 = os.path.join(ws1, "buggy_app", "calculator.py")
    file2 = os.path.join(ws2, "buggy_app", "calculator.py")
    pristine_file = os.path.join(DEMO_ORIGINAL, "calculator.py")

    assert os.path.isfile(file1)
    assert os.path.isfile(file2)

    with open(pristine_file, "r", encoding="utf-8") as f:
        pristine_content = f.read()
    with open(file1, "r", encoding="utf-8") as f:
        content1 = f.read()
    with open(file2, "r", encoding="utf-8") as f:
        content2 = f.read()

    # Both workspaces match pristine defect
    assert content1 == pristine_content
    assert content2 == pristine_content
    assert "return price + (price * (discount_percent / 100.0))" in content1
    assert "return price + (price * (discount_percent / 100.0))" in content2


def test_fix4_one_execution_patch_does_not_affect_another():
    """FIX 4: Modifying source code in workspace 1 does not mutate workspace 2 or pristine source."""
    ws1 = prepare_isolated_workspace(execution_id="exec_alpha", task_id="task_A")
    ws2 = prepare_isolated_workspace(execution_id="exec_beta", task_id="task_B")

    # Patch workspace 1
    diff = apply_patch_safely(
        rel_target_file="buggy_app/calculator.py",
        target_snippet="return price + (price * (discount_percent / 100.0))",
        replacement_snippet="return price - (price * (discount_percent / 100.0))",
        workspace_dir=ws1,
    )
    assert "--- a/buggy_app/calculator.py" in diff

    file1 = os.path.join(ws1, "buggy_app", "calculator.py")
    file2 = os.path.join(ws2, "buggy_app", "calculator.py")
    pristine_file = os.path.join(DEMO_ORIGINAL, "calculator.py")

    with open(file1, "r", encoding="utf-8") as f:
        c1 = f.read()
    with open(file2, "r", encoding="utf-8") as f:
        c2 = f.read()
    with open(pristine_file, "r", encoding="utf-8") as f:
        cp = f.read()

    # Workspace 1 has the patch
    assert "return price - (price * (discount_percent / 100.0))" in c1
    # Workspace 2 still has pristine buggy code
    assert "return price + (price * (discount_percent / 100.0))" in c2
    # Pristine fixture still has pristine buggy code
    assert "return price + (price * (discount_percent / 100.0))" in cp


def test_fix4_invalid_path_components_are_rejected():
    """FIX 4: Path traversal sequences, null bytes, and illegal characters are rejected."""
    bad_identifiers = [
        "../traversal",
        "..\\windows_traversal",
        "/absolute_path",
        "nested/path",
        "nested\\path",
        "null\x00byte",
        "",
        "   ",
        "exec;rm -rf",
        "exec$bad",
        "exec@bad",
    ]
    for bad_id in bad_identifiers:
        with pytest.raises(ValueError):
            validate_path_identifier("execution_id", bad_id)

    # Test get_workspace_path rejects bad execution_id
    with pytest.raises(ValueError):
        get_workspace_path(execution_id="../escape", task_id="valid_task")

    # Test get_workspace_path rejects bad task_id
    with pytest.raises(ValueError):
        get_workspace_path(execution_id="valid_exec", task_id="../../escape")


def test_fix4_cleanup_cannot_delete_another_executions_workspace():
    """FIX 4: Cleanup of execution 1 deletes only workspace 1, leaving workspace 2 and demo roots intact."""
    ws1 = prepare_isolated_workspace(execution_id="exec_1", task_id="task_1")
    ws2 = prepare_isolated_workspace(execution_id="exec_2", task_id="task_2")

    assert os.path.isdir(ws1)
    assert os.path.isdir(ws2)

    # Clean up exec_1
    cleanup_isolated_workspace(execution_id="exec_1", task_id="task_1")

    # ws1 is deleted
    assert not os.path.exists(ws1)
    # ws2 is preserved untouched
    assert os.path.isdir(ws2)
    assert os.path.isfile(os.path.join(ws2, "buggy_app", "calculator.py"))
    # Demo roots preserved
    assert os.path.isdir(DEMO_ORIGINAL)
    assert os.path.isdir(DEMO_WORKSPACES_ROOT)

    # Attempting to clean up outside roots raises ValueError
    with pytest.raises(ValueError):
        cleanup_isolated_workspace(execution_id="../demo", task_id="task_1")
