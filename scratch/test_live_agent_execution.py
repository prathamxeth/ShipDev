#!/usr/bin/env python3
"""
Test Genuine Live Agent Execution Path with Real Subprocesses and Human Gate Approval
"""

import os
import sys
import time
import json
import socket
import signal
import subprocess
import urllib.request
import urllib.error

FASTAPI_PORT = 8000
FRONTEND_PORT = 3000
AGENT_SECRET = "real-agent-secret-49281749"
HUMAN_SECRET = "real-human-secret-83021948"
OPERATOR_ID = "shipdev-operator"
TEST_DB = "/tmp/shipdev_agent_live_genuine_test.db"

backend_proc = None
frontend_proc = None


def wait_for_port(port: int, timeout: float = 20.0):
    start = time.time()
    while time.time() - start < timeout:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        res = s.connect_ex(("127.0.0.1", port))
        s.close()
        if res == 0:
            return True
        time.sleep(0.3)
    return False


def make_request(url: str, method: str = "GET", headers: dict = None, body: dict = None):
    headers = headers or {}
    data = json.dumps(body).encode("utf-8") if body is not None else None
    if body and "Content-Type" not in headers:
        headers["Content-Type"] = "application/json"
    if "Accept" not in headers:
        headers["Accept"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10.0) as resp:
        content = resp.read().decode("utf-8")
        return json.loads(content) if content else None


def main():
    global backend_proc, frontend_proc
    print("\n" + "=" * 75)
    print("GENUINE AGENT EXECUTION PATH VERIFICATION (DEMO FIXTURE)")
    print("=" * 75, flush=True)

    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)

    backend_dir = os.path.abspath("backend")
    frontend_dir = os.path.abspath("frontend")
    uvicorn_bin = os.path.join(backend_dir, ".venv", "bin", "uvicorn")

    try:
        # 1. Start FastAPI Backend
        b_env = os.environ.copy()
        b_env.update({
            "API_SECRET_KEY": AGENT_SECRET,
            "HUMAN_APPROVAL_SECRET": HUMAN_SECRET,
            "HUMAN_OPERATOR_IDENTITY": OPERATOR_ID,
            "DATABASE_URL": f"sqlite:///{TEST_DB}",
            "FRONTEND_ORIGIN": "http://localhost:3000",
            "HOST": "127.0.0.1",
            "PORT": str(FASTAPI_PORT),
        })

        print("  Starting FastAPI server...", flush=True)
        backend_proc = subprocess.Popen(
            [uvicorn_bin, "app.main:app", "--host", "127.0.0.1", "--port", str(FASTAPI_PORT)],
            cwd=backend_dir,
            env=b_env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            preexec_fn=os.setsid,
        )
        if not wait_for_port(FASTAPI_PORT):
            raise RuntimeError("FastAPI failed to start")
        print("  ✓ FastAPI started on port 8000", flush=True)

        # 2. Start Next.js Frontend
        f_env = os.environ.copy()
        f_env.update({
            "NEXT_PUBLIC_API_URL": f"http://127.0.0.1:{FASTAPI_PORT}/api/v1",
            "BACKEND_API_URL": f"http://127.0.0.1:{FASTAPI_PORT}/api/v1",
            "HUMAN_APPROVAL_SECRET": HUMAN_SECRET,
            "APP_ORIGIN": "http://localhost:3000",
            "LOCAL_OPERATOR_IDENTITY": OPERATOR_ID,
            "PORT": str(FRONTEND_PORT),
            "HOSTNAME": "127.0.0.1",
        })

        print("  Starting Next.js frontend...", flush=True)
        frontend_proc = subprocess.Popen(
            ["npx", "next", "start", "-p", str(FRONTEND_PORT), "-H", "127.0.0.1"],
            cwd=frontend_dir,
            env=f_env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            preexec_fn=os.setsid,
        )
        if not wait_for_port(FRONTEND_PORT):
            raise RuntimeError("Next.js failed to start")
        print("  ✓ Next.js started on port 3000", flush=True)

        # 3. Create Real Task for Demo Calculator Defect
        print("\n[Step 1] Developer submits bug report for demo calculator defect...", flush=True)
        created = make_request(
            f"http://127.0.0.1:{FASTAPI_PORT}/api/v1/tasks",
            method="POST",
            body={
                "title": "Calculator discount function calculates price surcharge instead of deduction",
                "description": "Regression test test_calculate_discount_applies_correct_reduction fails with AssertionError: expected 80.0, got 120.0.",
                "reported_by": "lead-qa@shipdev.io",
                "input_source": "text",
            },
        )
        task_id = created["id"]
        print(f"  ✓ Bug report created: ID={task_id}, Status={created['status']}", flush=True)

        # 4. Trigger Real Agent Pipeline Runner
        print("\n[Step 2] Executing genuine agent pipeline runner...", flush=True)
        runner_cmd = [
            sys.executable,
            "scripts/run_agent_pipeline.py",
            "--task-id",
            task_id,
            "--api-base",
            f"http://127.0.0.1:{FASTAPI_PORT}/api/v1",
            "--agent-secret",
            AGENT_SECRET,
        ]
        runner_res = subprocess.run(runner_cmd, capture_output=True, text=True)
        print(runner_res.stdout)
        if runner_res.returncode != 0:
            print("Stderr:", runner_res.stderr)
            raise RuntimeError(f"Agent runner failed with return code {runner_res.returncode}")

        # 5. Verify Task is in AWAITING_HUMAN_APPROVAL
        print("\n[Step 3] Verifying task state in FastAPI backend...", flush=True)
        task_check = make_request(f"http://127.0.0.1:{FASTAPI_PORT}/api/v1/tasks/{task_id}")
        print(f"  Backend Task Status: {task_check['status']}", flush=True)
        assert task_check["status"] == "AWAITING_HUMAN_APPROVAL", f"Expected AWAITING_HUMAN_APPROVAL, got {task_check['status']}"

        # 6. Verify Authentic Evidence
        ev_list = make_request(f"http://127.0.0.1:{FASTAPI_PORT}/api/v1/tasks/{task_id}/evidence")
        print(f"  ✓ Evidence count attached: {len(ev_list)}", flush=True)
        assert len(ev_list) == 2, f"Expected exactly 2 evidence records, found {len(ev_list)}"

        repro_ev = next(e for e in ev_list if e["stage"] == "reproduction")
        ver_ev = next(e for e in ev_list if e["stage"] == "verification")

        # Verify Reproduction Evidence Authenticity
        print(f"\n  [Reproduction Evidence Check]")
        print(f"    ID: {repro_ev['id']}")
        print(f"    Command: {repro_ev['command_executed']}")
        print(f"    Exit code: {repro_ev['exit_code']} (Must be 1 for test failure)")
        print(f"    is_mock: {repro_ev['is_mock']}")
        assert repro_ev["exit_code"] == 1, "Reproduction exit code must be 1"
        assert "AssertionError" in repro_ev["stdout"], "Reproduction stdout must contain real AssertionError"
        assert not repro_ev["is_mock"], "is_mock must be False"

        # Verify Verification Evidence Authenticity
        print(f"\n  [Verification Evidence Check]")
        print(f"    ID: {ver_ev['id']}")
        print(f"    Command: {ver_ev['command_executed']}")
        print(f"    Exit code: {ver_ev['exit_code']} (Must be 0 for test pass)")
        print(f"    is_mock: {ver_ev['is_mock']}")
        print(f"    Patch diff:\n{ver_ev['patch_diff']}")
        assert ver_ev["exit_code"] == 0, "Verification exit code must be 0"
        assert "3 passed" in ver_ev["stdout"], "Verification stdout must confirm all 3 tests passed"
        assert "--- a/buggy_app/calculator.py" in ver_ev["patch_diff"]
        assert "+    return price - (price * (discount_percent / 100.0))" in ver_ev["patch_diff"]
        assert not ver_ev["is_mock"], "is_mock must be False"

        # 7. Approve via Next.js Human Gate
        print("\n[Step 4] Human engineer approves patch via Next.js BFF...", flush=True)
        approve_res = make_request(
            f"http://127.0.0.1:{FRONTEND_PORT}/api/gate/approve",
            method="POST",
            headers={"Origin": "http://localhost:3000"},
            body={"taskId": task_id, "comments": "Reviewed authentic unified diff and regression test logs. Approved."},
        )
        print(f"  ✓ Task status after human approval: {approve_res['status']}", flush=True)
        assert approve_res["status"] == "APPROVED"

        # 8. Complete via Next.js Human Gate
        print("\n[Step 5] Human engineer completes task via Next.js BFF...", flush=True)
        complete_res = make_request(
            f"http://127.0.0.1:{FRONTEND_PORT}/api/gate/complete",
            method="POST",
            headers={"Origin": "http://localhost:3000"},
            body={"taskId": task_id},
        )
        print(f"  ✓ Final task status: {complete_res['status']}", flush=True)
        assert complete_res["status"] == "COMPLETED"

        print("\n" + "=" * 75)
        print("GENUINE AGENT EXECUTION PATH FULLY VERIFIED (100% NON-MOCK)")
        print("=" * 75 + "\n")

    finally:
        print("[Teardown] Stopping servers...")
        if frontend_proc:
            try:
                os.killpg(os.getpgid(frontend_proc.pid), signal.SIGTERM)
                frontend_proc.wait(timeout=3)
            except Exception:
                pass
        if backend_proc:
            try:
                os.killpg(os.getpgid(backend_proc.pid), signal.SIGTERM)
                backend_proc.wait(timeout=3)
            except Exception:
                pass
        if os.path.exists(TEST_DB):
            try:
                os.remove(TEST_DB)
            except Exception:
                pass


if __name__ == "__main__":
    main()

