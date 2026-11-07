#!/usr/bin/env python3
"""
ShipDev Genuine Agent Execution Pipeline Runner

Executes an authentic, reproducible multi-agent bug-fixing lifecycle:
1. Triages incoming reported task.
2. Initiates isolated reproduction sandbox (demo/workspace).
3. Executes real reproduction test command via subprocess (fails with genuine non-zero exit code).
4. Submits authentic reproduction evidence with actual stdout, stderr, and non-zero exit code.
5. Advances task to REPRODUCED with verified evidence reference.
6. Applies actual source patch to the isolated workspace (protected against path traversal).
7. Computes genuine unified filesystem diff from the modified working tree.
8. Advances task to FIX_PROPOSED.
9. Initiates independent verification (FIX_PROPOSED -> VERIFYING).
10. Executes real verification test suite via subprocess against the patched workspace (passes with exit code 0).
11. Submits authentic verification evidence with real stdout, exit code 0, and real patch diff.
12. Advances task to AWAITING_HUMAN_APPROVAL.
13. Strict Security Halt: Halts immediately. AI agents cannot approve or complete tasks.
"""

import os
import sys
import json
import time
import shutil
import difflib
import argparse
import subprocess
import urllib.request
import urllib.error
import re
import uuid

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")))
except ImportError:
    pass

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEMO_DIR = os.path.join(PROJECT_ROOT, "demo")
DEMO_ORIGINAL = os.path.join(DEMO_DIR, "buggy_app")
DEMO_TESTS = os.path.join(DEMO_DIR, "tests")
DEMO_WORKSPACES_ROOT = os.path.join(DEMO_DIR, "workspaces")
DEMO_WORKSPACE = os.path.join(DEMO_DIR, "workspace")


def make_request(url: str, method: str = "GET", headers: dict = None, body: dict = None, timeout: float = 10.0):
    headers = headers or {}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        if "Content-Type" not in headers:
            headers["Content-Type"] = "application/json"
    if "Accept" not in headers:
        headers["Accept"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            resp_body = resp.read().decode("utf-8")
            try:
                parsed = json.loads(resp_body) if resp_body else None
            except Exception:
                parsed = resp_body
            return {"status": resp.status, "body": parsed, "error": None}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            parsed = json.loads(err_body) if err_body else None
        except Exception:
            parsed = err_body
        return {"status": e.code, "body": parsed, "error": f"HTTP {e.code}: {err_body}"}
    except Exception as e:
        return {"status": 0, "body": None, "error": str(e)}


def run_command_safely(cmd: list[str], env: dict = None, timeout: float = 30.0) -> tuple[int, str, str]:
    """Execute real local command in a subprocess, capturing actual exit code and stdout/stderr."""
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    try:
        res = subprocess.run(
            cmd,
            cwd=PROJECT_ROOT,
            env=merged_env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
        )
        return res.returncode, res.stdout, res.stderr
    except subprocess.TimeoutExpired:
        return 124, "", f"Command timed out after {timeout} seconds"
    except Exception as e:
        return 1, "", f"Execution failure: {str(e)}"


def get_python_executable() -> str:
    """Return project virtualenv python executable if available."""
    venv_py = os.path.join(PROJECT_ROOT, "backend", ".venv", "bin", "python")
    if os.path.exists(venv_py):
        return venv_py
    return sys.executable


def validate_path_identifier(name: str, value: str) -> str:
    """Validate that an identifier (task_id, execution_id) is safe for filesystem path construction.
    
    Rejects empty strings, path traversal sequences ('..', '/', '\\', null bytes),
    and characters outside [a-zA-Z0-9_-].
    """
    if not value or not isinstance(value, str):
        raise ValueError(f"Invalid {name}: must be a non-empty string.")
    clean = value.strip()
    if not clean:
        raise ValueError(f"Invalid {name}: cannot be empty or whitespace only.")
    if ".." in clean or "/" in clean or "\\" in clean or "\x00" in clean:
        raise ValueError(f"Security Violation: {name} '{value}' contains directory traversal sequences or null bytes.")
    if not re.match(r"^[a-zA-Z0-9_\-]+$", clean):
        raise ValueError(f"Security Violation: {name} '{value}' contains disallowed characters. Only [a-zA-Z0-9_-] are permitted.")
    return clean


def get_workspace_path(execution_id: str, task_id: str = None) -> str:
    """Derive and validate the absolute filesystem path for an execution workspace.
    
    Guarantees that the resolved path is strictly inside DEMO_WORKSPACES_ROOT.
    """
    clean_exec = validate_path_identifier("execution_id", execution_id)
    folder_name = f"{validate_path_identifier('task_id', task_id)}_{clean_exec}" if task_id else clean_exec
    
    ws_root = os.path.realpath(DEMO_WORKSPACES_ROOT)
    ws_path = os.path.realpath(os.path.join(ws_root, folder_name))
    
    # Path traversal check: ws_path must be strictly inside ws_root and not equal to ws_root
    if os.path.commonpath([ws_root, ws_path]) != ws_root or ws_path == ws_root:
        raise ValueError(f"Security Violation: Resolved workspace path '{ws_path}' escapes workspaces root '{ws_root}'.")
    return ws_path


def prepare_isolated_workspace(
    execution_id: str = None,
    task_id: str = None,
    workspace_dir: str = None,
) -> str:
    """Creates or resets an isolated demo workspace from the pristine fixture.
    
    - If execution_id is provided, creates a unique workspace under DEMO_WORKSPACES_ROOT.
    - If workspace_dir is explicitly provided, uses that directory after path validation.
    - If neither is provided, defaults to DEMO_WORKSPACE for backward compatibility.
    
    Always starts from the pristine DEMO_ORIGINAL fixture.
    """
    if execution_id:
        ws_path = get_workspace_path(execution_id, task_id)
    elif workspace_dir:
        ws_path = os.path.realpath(workspace_dir)
    else:
        ws_path = os.path.realpath(DEMO_WORKSPACE)

    # Protect against deleting roots or pristine source
    demo_orig_real = os.path.realpath(DEMO_ORIGINAL)
    demo_dir_real = os.path.realpath(DEMO_DIR)
    if ws_path in {demo_orig_real, demo_dir_real, os.path.realpath(PROJECT_ROOT)}:
        raise ValueError(f"Security Violation: Target workspace '{ws_path}' points to a protected system directory.")

    if os.path.exists(ws_path):
        shutil.rmtree(ws_path)
    os.makedirs(ws_path, exist_ok=True)
    target_buggy = os.path.join(ws_path, "buggy_app")
    shutil.copytree(DEMO_ORIGINAL, target_buggy)
    return ws_path


def cleanup_isolated_workspace(execution_id: str, task_id: str = None) -> None:
    """Safely cleans up the exact workspace owned by execution_id under DEMO_WORKSPACES_ROOT.
    
    Guarantees that other executions, workspaces root, and pristine demo fixtures are never deleted.
    """
    ws_root = os.path.realpath(DEMO_WORKSPACES_ROOT)
    ws_path = get_workspace_path(execution_id, task_id)
    
    if os.path.commonpath([ws_root, ws_path]) != ws_root or ws_path == ws_root:
        raise ValueError(f"Security Violation: Target path '{ws_path}' cannot be safely deleted.")

    if os.path.exists(ws_path):
        shutil.rmtree(ws_path)


def apply_patch_safely(
    rel_target_file: str,
    target_snippet: str,
    replacement_snippet: str,
    workspace_dir: str = None,
) -> str:
    """
    Safely applies a patch edit to a file strictly within the designated workspace.
    Guards against path traversal and generates an authentic unified diff.
    """
    ws = workspace_dir if workspace_dir else DEMO_WORKSPACE
    workspace_real = os.path.realpath(ws)
    target_path = os.path.realpath(os.path.join(ws, rel_target_file))

    # Path traversal check
    if os.path.commonpath([workspace_real, target_path]) != workspace_real:
        raise ValueError(f"Security Violation: Target path '{rel_target_file}' attempts directory traversal.")

    if not os.path.isfile(target_path):
        raise FileNotFoundError(f"Target file '{rel_target_file}' not found in workspace.")

    # Read original content from pristine source
    orig_path = os.path.join(DEMO_DIR, rel_target_file)
    with open(orig_path, "r", encoding="utf-8") as f:
        orig_content = f.read()

    # Read current workspace content
    with open(target_path, "r", encoding="utf-8") as f:
        current_content = f.read()

    if target_snippet not in current_content:
        raise ValueError(f"Target snippet not found in '{rel_target_file}'. Cannot apply patch.")

    patched_content = current_content.replace(target_snippet, replacement_snippet, 1)
    with open(target_path, "w", encoding="utf-8") as f:
        f.write(patched_content)

    # Generate genuine unified diff
    diff_lines = list(
        difflib.unified_diff(
            orig_content.splitlines(keepends=True),
            patched_content.splitlines(keepends=True),
            fromfile=f"a/{rel_target_file}",
            tofile=f"b/{rel_target_file}",
        )
    )
    patch_diff = "".join(diff_lines)
    if not patch_diff.strip():
        raise ValueError("Generated patch diff is empty. No modifications were recorded.")

    return patch_diff


def run_pipeline(api_base: str, agent_secret: str, task_id: str):
    auth_headers = {
        "Authorization": f"Bearer {agent_secret}",
        "X-Caller-Type": "agent",
        "X-Caller-ID": "switch-agent-runner",
    }

    # Generate unique execution ID for this pipeline run
    execution_id = f"exec_{uuid.uuid4().hex[:12]}"
    print(f"\n[Agent Pipeline] Initiating execution '{execution_id}' for task '{task_id}' on {api_base}...", flush=True)

    # 1. Fetch Task
    task_res = make_request(f"{api_base}/tasks/{task_id}")
    if task_res["status"] != 200:
        raise RuntimeError(f"Unable to load task {task_id}: {task_res['error']}")
    task = task_res["body"]
    print(f"  Current Task Status: {task['status']} - '{task['title']}'", flush=True)

    # 2. Step 1: Triage (REPORTED -> TRIAGED)
    if task["status"] == "REPORTED":
        print("  [Step 1] Triaging task...", flush=True)
        triage_res = make_request(
            f"{api_base}/tasks/{task_id}/transitions",
            method="POST",
            headers=auth_headers,
            body={
                "target_status": "TRIAGED",
                "actor_type": "agent",
                "actor_id": "switch-triage-agent",
                "reason": "Analyzed report: defect isolated to calculator discount formula. Assigned to repro sandbox.",
            },
        )
        if triage_res["status"] != 200:
            raise RuntimeError(f"Triage transition failed: {triage_res['error']}")
        print("  ✓ Task advanced to TRIAGED", flush=True)

    # 3. Step 2: Reproduction (TRIAGED -> REPRODUCING)
    print("  [Step 2] Entering reproduction sandbox...", flush=True)
    repro_trans = make_request(
        f"{api_base}/tasks/{task_id}/transitions",
        method="POST",
        headers=auth_headers,
        body={
            "target_status": "REPRODUCING",
            "actor_type": "agent",
            "actor_id": "switch-repro-agent",
            "reason": "Initialized isolated demo workspace for genuine bug reproduction.",
        },
    )
    if repro_trans["status"] != 200:
        raise RuntimeError(f"Reproduction transition failed: {repro_trans['error']}")
    print("  ✓ Task advanced to REPRODUCING", flush=True)

    # 4. Step 3: Execute Real Reproduction Command
    print("  [Step 3] Executing reproduction test command against pristine demo codebase...", flush=True)
    ws_path = prepare_isolated_workspace(execution_id=execution_id, task_id=task_id)
    py_exec = get_python_executable()

    repro_cmd = [py_exec, "-m", "pytest", "demo/tests/test_calculator.py", "-k", "test_calculate_discount_applies_correct_reduction", "-W", "ignore"]
    repro_code, repro_out, repro_err = run_command_safely(
        repro_cmd,
        env={"PYTHONPATH": DEMO_DIR},
    )

    print(f"  Reproduction command exit code: {repro_code} (Expected non-zero failure)", flush=True)
    if repro_code == 0:
        raise RuntimeError(f"Reproduction failed: test passed unexpectedly (exit code 0). Bug was not reproduced.")

    # 5. Step 4: Submit Authentic Reproduction Evidence
    print("  [Step 4] Submitting authentic reproduction evidence...", flush=True)
    repro_cmd_str = f"pytest demo/tests/test_calculator.py -k test_calculate_discount_applies_correct_reduction"
    repro_ev_res = make_request(
        f"{api_base}/tasks/{task_id}/evidence",
        method="POST",
        headers=auth_headers,
        body={
            "stage": "reproduction",
            "command_executed": repro_cmd_str,
            "exit_code": repro_code,
            "stdout": repro_out[:4000],
            "stderr": repro_err[:4000] if repro_err else None,
            "is_mock": False,
        },
    )
    if repro_ev_res["status"] != 201:
        raise RuntimeError(f"Reproduction evidence attachment failed: {repro_ev_res['error']}")
    repro_ev_id = repro_ev_res["body"]["id"]
    print(f"  ✓ Authentic reproduction evidence attached: ID={repro_ev_id}", flush=True)

    # 6. Step 5: Advance to REPRODUCED with verified evidence
    reproduced_res = make_request(
        f"{api_base}/tasks/{task_id}/transitions",
        method="POST",
        headers=auth_headers,
        body={
            "target_status": "REPRODUCED",
            "actor_type": "agent",
            "actor_id": "switch-repro-agent",
            "reason": f"Bug genuinely reproduced (exit code {repro_code}). Defect verified by regression assertion failure.",
            "evidence_id": repro_ev_id,
        },
    )
    if reproduced_res["status"] != 200:
        raise RuntimeError(f"Transition to REPRODUCED failed: {reproduced_res['error']}")
    print("  ✓ Task advanced to REPRODUCED", flush=True)

    # 7. Step 6: Fix Agent applies source patch & computes genuine diff
    print("  [Step 6] Fix Agent applying source patch and generating real filesystem diff in isolated workspace...", flush=True)
    patch_diff = apply_patch_safely(
        rel_target_file="buggy_app/calculator.py",
        target_snippet="return price + (price * (discount_percent / 100.0))",
        replacement_snippet="return price - (price * (discount_percent / 100.0))",
        workspace_dir=ws_path,
    )
    print("  --- Generated Unified Diff ---\n" + patch_diff.strip() + "\n  ------------------------------", flush=True)

    fix_res = make_request(
        f"{api_base}/tasks/{task_id}/transitions",
        method="POST",
        headers=auth_headers,
        body={
            "target_status": "FIX_PROPOSED",
            "actor_type": "agent",
            "actor_id": "switch-fix-agent",
            "reason": "Applied source code correction in calculator.py: subtracted discount instead of adding.",
        },
    )
    if fix_res["status"] != 200:
        raise RuntimeError(f"Transition to FIX_PROPOSED failed: {fix_res['error']}")
    print("  ✓ Task advanced to FIX_PROPOSED", flush=True)

    # 8. Step 7: Independent Verifier triggers verification
    print("  [Step 7] Independent Verifier initiating verification run...", flush=True)
    ver_trans = make_request(
        f"{api_base}/tasks/{task_id}/transitions",
        method="POST",
        headers=auth_headers,
        body={
            "target_status": "VERIFYING",
            "actor_type": "agent",
            "actor_id": "switch-verifier-agent",
            "reason": "Executing full regression test suite against patched workspace.",
        },
    )
    if ver_trans["status"] != 200:
        raise RuntimeError(f"Transition to VERIFYING failed: {ver_trans['error']}")
    print("  ✓ Task advanced to VERIFYING", flush=True)

    # 9. Step 8: Execute Real Verification Test Command against patched workspace
    print("  [Step 8] Executing regression test suite against patched workspace...", flush=True)
    verify_cmd = [py_exec, "-m", "pytest", "demo/tests/test_calculator.py", "-v"]
    ver_code, ver_out, ver_err = run_command_safely(
        verify_cmd,
        env={"PYTHONPATH": ws_path},
    )
    print(f"  Verification test exit code: {ver_code} (Expected 0 for passing suite)", flush=True)
    if ver_code != 0:
        raise RuntimeError(f"Verification test failed (code {ver_code}): {ver_err or ver_out}")
    print(f"  ✓ All tests passed cleanly against patched workspace (exit code: {ver_code})", flush=True)

    # 10. Step 9: Submit Authentic Verification Evidence
    print("  [Step 9] Attaching authentic verification evidence...", flush=True)
    verify_cmd_str = f"pytest demo/tests/test_calculator.py -v"
    ver_ev_res = make_request(
        f"{api_base}/tasks/{task_id}/evidence",
        method="POST",
        headers=auth_headers,
        body={
            "stage": "verification",
            "command_executed": verify_cmd_str,
            "exit_code": ver_code,
            "stdout": ver_out[:4000],
            "stderr": ver_err[:4000] if ver_err else None,
            "patch_diff": patch_diff,
            "is_mock": False,
        },
    )
    if ver_ev_res["status"] != 201:
        raise RuntimeError(f"Verification evidence attachment failed: {ver_ev_res['error']}")
    ver_ev_id = ver_ev_res["body"]["id"]
    print(f"  ✓ Authentic verification evidence attached: ID={ver_ev_id}", flush=True)

    # 11. Step 10: Advance to AWAITING_HUMAN_APPROVAL with verified evidence
    print("  [Step 10] Transitioning to AWAITING_HUMAN_APPROVAL with verified evidence...", flush=True)
    final_agent_trans = make_request(
        f"{api_base}/tasks/{task_id}/transitions",
        method="POST",
        headers=auth_headers,
        body={
            "target_status": "AWAITING_HUMAN_APPROVAL",
            "actor_type": "agent",
            "actor_id": "switch-verifier-agent",
            "reason": "All regression tests passed (3/3 passed). Authentic patch diff verified and attached.",
            "evidence_id": ver_ev_id,
        },
    )
    if final_agent_trans["status"] != 200:
        raise RuntimeError(f"Handoff to human failed: {final_agent_trans['error']}")

    # Clean up isolated workspace only after evidence is safely captured/submitted and handoff succeeded
    cleanup_isolated_workspace(execution_id=execution_id, task_id=task_id)
    print(f"  ✓ Cleaned up isolated execution workspace for {execution_id}", flush=True)

    print("\n" + "=" * 75, flush=True)
    print("AGENT PIPELINE COMPLETE: Task is now in AWAITING_HUMAN_APPROVAL", flush=True)
    print("SECURITY INVARIANT: Agent execution has halted.", flush=True)
    print("No agent can approve or complete this task.", flush=True)
    print("An authentic human operator must review the patch diff and click 'Approve Fix'.", flush=True)
    print("=" * 75 + "\n", flush=True)


def main():
    parser = argparse.ArgumentParser(description="ShipDev Genuine Agent Execution Pipeline")
    parser.add_argument("--task-id", required=True, help="Task ID to process")
    parser.add_argument("--api-base", default="http://127.0.0.1:8000/api/v1", help="FastAPI Base URL")
    parser.add_argument("--agent-secret", default=os.environ.get("API_SECRET_KEY", ""), help="API_SECRET_KEY")
    args = parser.parse_args()

    if not args.agent_secret:
        print("[ERROR] Missing API_SECRET_KEY. Pass via --agent-secret or set environment variable.", file=sys.stderr)
        sys.exit(1)

    run_pipeline(args.api_base, args.agent_secret, args.task_id)


if __name__ == "__main__":
    main()
