"""Focused Acceptance Test for Conversational Intelligence, Task Continuity, and Gemini Integration."""

import os
from dotenv import load_dotenv
load_dotenv('.env')

from fastapi.testclient import TestClient
from app.main import app
from app.models.task import TaskStatus


def test_complete_conversational_workflow():
    client = TestClient(app)
    ws_id = "ws_personal_default"
    headers = {"X-Workspace-ID": ws_id}

    # Step 1: "hiii"
    r1 = client.post(f"/api/v1/workspaces/{ws_id}/assistant", json={"message": "hiii"}, headers=headers)
    assert r1.status_code == 200, f"Step 1 failed: {r1.text}"
    d1 = r1.json()
    assert d1["category"] == "conversation", f"Step 1 wrong category: {d1['category']}"
    assert "Hello!" in d1["reply_text"], "Step 1 missing greeting"
    assert d1["task"] is None, "Step 1 must NOT create a task"

    # Step 2: "What can you do?"
    r2 = client.post(f"/api/v1/workspaces/{ws_id}/assistant", json={"message": "What can you do?"}, headers=headers)
    assert r2.status_code == 200, f"Step 2 failed: {r2.text}"
    d2 = r2.json()
    assert d2["category"] == "capabilities", f"Step 2 wrong category: {d2['category']}"
    assert "Project Analysis" in d2["reply_text"], "Step 2 missing capabilities"
    assert d2["task"] is None, "Step 2 must NOT create a task"

    # Step 3: "Analyze this project and identify three improvements."
    r3 = client.post(
        f"/api/v1/workspaces/{ws_id}/assistant",
        json={"message": "Analyze this project and identify three improvements."},
        headers=headers,
    )
    assert r3.status_code == 200, f"Step 3 failed: {r3.text}"
    d3 = r3.json()
    assert d3["category"] == "analysis", f"Step 3 wrong category: {d3['category']}"
    assert len(d3["improvements"]) == 3, f"Step 3 expected 3 improvements, got {len(d3['improvements'])}"
    assert "calculate_discount" in d3["reply_text"], "Step 3 missing calculate_discount finding"
    assert "calculator.py:22" in d3["reply_text"], "Step 3 missing file and line reference"
    assert d3["task"] is None, "Step 3 must NOT automatically create a task"

    # Step 4: "Execute the improvements."
    r4 = client.post(
        f"/api/v1/workspaces/{ws_id}/assistant",
        json={"message": "Execute the improvements."},
        headers=headers,
    )
    assert r4.status_code == 200, f"Step 4 failed: {r4.text}"
    d4 = r4.json()
    assert d4["task"] is not None, "Step 4 MUST create a task"
    task_id = d4["task"]["id"]
    assert d4["pipeline_executed"] is True, "Step 4 must execute pipeline"
    assert d4["needs_approval"] is True, "Step 4 must halt at approval gate"
    assert d4["task"]["status"] == TaskStatus.AWAITING_HUMAN_APPROVAL.value, f"Step 4 expected AWAITING_HUMAN_APPROVAL, got {d4['task']['status']}"
    assert d4["patch_diff"] is not None, "Step 4 must return patch diff"
    assert d4["test_evidence"]["exit_code"] == 0, "Step 4 test evidence exit code must be 0"

    # Step 5: "Show execution progress."
    r5 = client.post(
        f"/api/v1/workspaces/{ws_id}/assistant",
        json={"message": "Show execution progress."},
        headers=headers,
    )
    assert r5.status_code == 200, f"Step 5 failed: {r5.text}"
    d5 = r5.json()
    assert d5["task"] is not None, "Step 5 must resolve existing task"
    assert d5["task"]["id"] == task_id, f"Step 5 task id mismatch! Expected {task_id}, got {d5['task']['id']}"
    assert "Specialist Agent Execution Timeline" in d5["reply_text"]
    assert "shipdev-triager" in d5["reply_text"]
    assert "shipdev-verifier" in d5["reply_text"]

    # Step 6: "Show evidence and verification."
    r6 = client.post(
        f"/api/v1/workspaces/{ws_id}/assistant",
        json={"message": "Show evidence and verification."},
        headers=headers,
    )
    assert r6.status_code == 200, f"Step 6 failed: {r6.text}"
    d6 = r6.json()
    assert d6["task"] is not None, "Step 6 must resolve existing task"
    assert d6["task"]["id"] == task_id, f"Step 6 task id mismatch! Expected {task_id}, got {d6['task']['id']}"
    assert "Sandbox Reproduction Evidence" in d6["reply_text"]
    assert "Clean-Room Verification Evidence" in d6["reply_text"]
    assert "Exit Code:** `1`" in d6["reply_text"]
    assert "Exit Code:** `0`" in d6["reply_text"]

    # Step 7: "Show final results."
    r7 = client.post(
        f"/api/v1/workspaces/{ws_id}/assistant",
        json={"message": "Show final results."},
        headers=headers,
    )
    assert r7.status_code == 200, f"Step 7 failed: {r7.text}"
    d7 = r7.json()
    assert d7["task"] is not None, "Step 7 must resolve existing task"
    assert d7["task"]["id"] == task_id, f"Step 7 task id mismatch! Expected {task_id}, got {d7['task']['id']}"
    assert "Final Execution Results" in d7["reply_text"]
    assert "AWAITING_HUMAN_APPROVAL" in d7["reply_text"]
    assert d7["needs_approval"] is True


def test_gemini_runtime_configuration():
    from app.agents.gemini_runtime import GeminiAgentRuntime
    runtime = GeminiAgentRuntime()
    assert runtime.is_configured() is True
    assert runtime.model == "gemini-3.5-flash-lite"
    agents = runtime.get_registered_agents()
    assert len(agents) == 5
    assert all(a["provider"] == "Google Gemini" for a in agents)
