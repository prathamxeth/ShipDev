"""
ShipDev Phase 2 — Genuine Bug Reproduction, Safe Patch Application & State Machine Invariants
"""

import os
import sys
import shutil
from pathlib import Path

# Add project root to sys.path so scripts module can be imported
PROJECT_ROOT_DIR = str(Path(__file__).resolve().parent.parent.parent)
if PROJECT_ROOT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_ROOT_DIR)

import pytest
import httpx
from httpx import AsyncClient

from app.api.deps import get_repository
from app.db.session import init_db
from app.main import app
from app.repositories.task_repository import TaskRepository
from app.core.state_machine import (
    CallerType,
    InvalidStateTransitionError,
    MissingEvidenceError,
    TaskStatus,
    UnauthorizedTransitionError,
    validate_transition,
)


@pytest.fixture
def test_repo(tmp_path):
    """Provide a TaskRepository configured with an isolated test SQLite database."""
    db_file = str(tmp_path / "test_pipeline_shipdev.db")
    init_db(db_file)
    return TaskRepository(db_path=db_file)


@pytest.fixture
def client(test_repo):
    """Provide an HTTPX AsyncClient with repository dependency overridden to test_repo."""
    app.dependency_overrides[get_repository] = lambda: test_repo
    transport = httpx.ASGITransport(app=app)
    yield httpx.AsyncClient(transport=transport, base_url="http://test")
    app.dependency_overrides.clear()
from scripts.run_agent_pipeline import (
    PROJECT_ROOT,
    DEMO_DIR,
    DEMO_WORKSPACE,
    DEMO_WORKSPACES_ROOT,
    apply_patch_safely,
    get_python_executable,
    prepare_isolated_workspace,
    run_command_safely,
)


@pytest.fixture(autouse=True)
def cleanup_workspace():
    """Ensure clean demo workspace before and after each test."""
    if os.path.exists(DEMO_WORKSPACE):
        shutil.rmtree(DEMO_WORKSPACE)
    if os.path.exists(DEMO_WORKSPACES_ROOT):
        shutil.rmtree(DEMO_WORKSPACES_ROOT)
    yield
    if os.path.exists(DEMO_WORKSPACE):
        shutil.rmtree(DEMO_WORKSPACE)
    if os.path.exists(DEMO_WORKSPACES_ROOT):
        shutil.rmtree(DEMO_WORKSPACES_ROOT)


def test_1_demo_bug_genuinely_fails():
    """Requirement 1: The original demo bug genuinely fails with a non-zero exit code and real assertion failure."""
    py_exec = get_python_executable()
    cmd = [py_exec, "-m", "pytest", "demo/tests/test_calculator.py", "-k", "test_calculate_discount_applies_correct_reduction"]
    returncode, stdout, stderr = run_command_safely(cmd, env={"PYTHONPATH": DEMO_DIR})

    # Must genuinely fail with exit code 1
    assert returncode == 1, f"Expected exit code 1, got {returncode}. Stdout: {stdout}"
    assert "AssertionError" in stdout
    assert "Defect reproduced" in stdout or "1 failed" in stdout
    assert "1 failed" in stdout


def test_2_and_3_patch_actually_modifies_source_and_generates_diff():
    """Requirements 2 & 3: The patch mechanism modifies source code on disk and generates an authentic unified diff."""
    prepare_isolated_workspace()
    target_rel = "buggy_app/calculator.py"
    target_abs = os.path.join(DEMO_WORKSPACE, target_rel)

    with open(target_abs, "r", encoding="utf-8") as f:
        pre_content = f.read()

    diff = apply_patch_safely(
        rel_target_file=target_rel,
        target_snippet="return price + (price * (discount_percent / 100.0))",
        replacement_snippet="return price - (price * (discount_percent / 100.0))",
    )

    with open(target_abs, "r", encoding="utf-8") as f:
        post_content = f.read()

    # 1. Source file is genuinely modified
    assert pre_content != post_content
    assert "return price - (price * (discount_percent / 100.0))" in post_content

    # 2. Genuine unified diff is generated
    assert diff.strip() != ""
    assert "--- a/buggy_app/calculator.py" in diff
    assert "+++ b/buggy_app/calculator.py" in diff
    assert "-    return price + (price * (discount_percent / 100.0))" in diff
    assert "+    return price - (price * (discount_percent / 100.0))" in diff


def test_4_regression_test_passes_after_patching():
    """Requirement 4: The regression test suite genuinely passes with exit code 0 when run against the patched workspace."""
    prepare_isolated_workspace()
    apply_patch_safely(
        rel_target_file="buggy_app/calculator.py",
        target_snippet="return price + (price * (discount_percent / 100.0))",
        replacement_snippet="return price - (price * (discount_percent / 100.0))",
    )

    py_exec = get_python_executable()
    cmd = [py_exec, "-m", "pytest", "demo/tests/test_calculator.py", "-v"]
    returncode, stdout, stderr = run_command_safely(cmd, env={"PYTHONPATH": DEMO_WORKSPACE})

    assert returncode == 0, f"Expected exit code 0, got {returncode}. Stdout: {stdout}, Stderr: {stderr}"
    assert "3 passed" in stdout
    assert "test_calculate_discount_applies_correct_reduction PASSED" in stdout


def test_5_failed_verification_blocks_approval_readiness():
    """Requirement 5: A non-zero verification exit code blocks transition to AWAITING_HUMAN_APPROVAL."""
    failing_verification = {
        "command_executed": "pytest demo/tests/test_calculator.py",
        "exit_code": 1,
        "patch_diff": "--- a/buggy_app/calculator.py\n+++ b/buggy_app/calculator.py\n@@ -1,1 +1,1 @@\n",
        "is_mock": False,
    }
    with pytest.raises(MissingEvidenceError) as exc_info:
        validate_transition(
            TaskStatus.VERIFYING,
            TaskStatus.AWAITING_HUMAN_APPROVAL,
            CallerType.AGENT,
            evidence=failing_verification,
        )
    assert "exit with code 0" in str(exc_info.value).lower()


def test_6_exit_code_zero_reproduction_is_rejected():
    """Requirement 6: Reproduction evidence with exit code 0 (test passed / bug not reproduced) is rejected."""
    passing_repro_evidence = {
        "command_executed": "pytest demo/tests/test_calculator.py",
        "exit_code": 0,  # Passing test cannot serve as reproduction evidence
        "is_mock": False,
    }
    with pytest.raises(MissingEvidenceError) as exc_info:
        validate_transition(
            TaskStatus.REPRODUCING,
            TaskStatus.REPRODUCED,
            CallerType.AGENT,
            evidence=passing_repro_evidence,
        )
    assert "non-zero exit code" in str(exc_info.value).lower()


def test_7_missing_or_empty_patch_is_rejected():
    """Requirement 7: Verification evidence lacking a patch diff is rejected."""
    empty_diff_evidence = {
        "command_executed": "pytest demo/tests/test_calculator.py",
        "exit_code": 0,
        "patch_diff": "   ",  # Whitespace / empty diff
        "is_mock": False,
    }
    with pytest.raises(MissingEvidenceError) as exc_info:
        validate_transition(
            TaskStatus.VERIFYING,
            TaskStatus.AWAITING_HUMAN_APPROVAL,
            CallerType.AGENT,
            evidence=empty_diff_evidence,
        )
    assert "proposed patch diff" in str(exc_info.value).lower()


def test_8_path_traversal_is_blocked():
    """Requirement 8: Path traversal attempts in patch application are blocked."""
    prepare_isolated_workspace()
    with pytest.raises(ValueError) as exc_info:
        apply_patch_safely(
            rel_target_file="../../backend/app/main.py",
            target_snippet="app = FastAPI",
            replacement_snippet="app = Malicious",
        )
    assert "traversal" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_9_runner_cannot_invoke_human_approval(client: AsyncClient):
    """Requirement 9: An agent token cannot invoke human approval gates or transition to APPROVED."""
    from app.core.config import settings

    agent_token = settings.API_SECRET_KEY
    assert agent_token, "API_SECRET_KEY must be configured for test"

    # 1. Direct transition to APPROVED via generic /transitions blocked (HTTP 400)
    trans_res = await client.post(
        "/api/v1/tasks/task_123/transitions",
        headers={"Authorization": f"Bearer {agent_token}", "X-Caller-Type": "agent", "X-Caller-ID": "agent"},
        json={"target_status": "APPROVED", "actor_type": "agent", "actor_id": "agent"},
    )
    assert trans_res.status_code == 400

    # 2. Agent token calling /approve blocked (HTTP 403)
    approve_res = await client.post(
        "/api/v1/tasks/task_123/approve",
        headers={"Authorization": f"Bearer {agent_token}"},
        json={"comments": "Agent trying to approve"},
    )
    assert approve_res.status_code == 403
