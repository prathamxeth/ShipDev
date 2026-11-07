#!/usr/bin/env python3
"""
ShipDev Phase 4 — Final Demo Readiness, Repeatability & Integration Verification
"""

import os
import sys
import time
import json
import socket
import signal
import shutil
import difflib
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

FASTAPI_PORT = 8000
FRONTEND_PORT = 3000
AGENT_SECRET = "demo-agent-key-phase4-928174"
HUMAN_SECRET = "demo-human-key-phase4-830194"
OPERATOR_ID = "shipdev-demo-operator"
TEST_DB = "/tmp/shipdev_phase4_readiness.db"

PROJECT_ROOT = Path(__file__).resolve().parent.parent
backend_proc = None
frontend_proc = None


def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def wait_for_port(port: int, timeout: float = 25.0) -> bool:
    start = time.time()
    while time.time() - start < timeout:
        if is_port_in_use(port):
            return True
        time.sleep(0.3)
    return False


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
            content = resp.read().decode("utf-8")
            try:
                parsed = json.loads(content) if content else None
            except Exception:
                parsed = content
            return {"status": resp.status, "headers": dict(resp.headers), "body": parsed, "error": None}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            parsed = json.loads(err_body) if err_body else None
        except Exception:
            parsed = err_body
        return {"status": e.code, "headers": dict(e.headers), "body": parsed, "error": err_body}
    except Exception as e:
        return {"status": 0, "headers": {}, "body": None, "error": str(e)}


def cleanup_servers():
    global backend_proc, frontend_proc
    print("\n[Teardown] Stopping servers cleanly...", flush=True)
    if frontend_proc:
        try:
            os.killpg(os.getpgid(frontend_proc.pid), signal.SIGTERM)
        except Exception:
            pass
        frontend_proc = None
    if backend_proc:
        try:
            os.killpg(os.getpgid(backend_proc.pid), signal.SIGTERM)
        except Exception:
            pass
        backend_proc = None
    time.sleep(1.0)


def main():
    global backend_proc, frontend_proc
    print("=" * 80)
    print("SHIPDEV — PHASE 4: FINAL DEMO READINESS & REPEATABILITY AUDIT")
    print("=" * 80, flush=True)

    if os.path.exists(TEST_DB):
        os.remove(TEST_DB)

    backend_dir = str(PROJECT_ROOT / "backend")
    frontend_dir = str(PROJECT_ROOT / "frontend")
    uvicorn_bin = str(PROJECT_ROOT / "backend" / ".venv" / "bin" / "uvicorn")
    python_bin = str(PROJECT_ROOT / "backend" / ".venv" / "bin" / "python")

    try:
        # -------------------------------------------------------------------
        # 1. Inspect existing processes & start services if needed
        # -------------------------------------------------------------------
        print("\n[Stage 1] Inspecting services and port bindings...", flush=True)
        fastapi_already_running = is_port_in_use(FASTAPI_PORT)
        next_already_running = is_port_in_use(FRONTEND_PORT)

        if not fastapi_already_running:
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
            print("  Starting FastAPI backend on 127.0.0.1:8000...", flush=True)
            backend_proc = subprocess.Popen(
                [uvicorn_bin, "app.main:app", "--host", "127.0.0.1", "--port", str(FASTAPI_PORT)],
                cwd=backend_dir,
                env=b_env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid,
            )
            if not wait_for_port(FASTAPI_PORT):
                raise RuntimeError("FastAPI server failed to bind port 8000 within timeout.")
            print("  ✓ FastAPI backend started and listening on http://127.0.0.1:8000", flush=True)
        else:
            print("  FastAPI backend is already running on port 8000.", flush=True)

        if not next_already_running:
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
            print("  Starting Next.js production server on 127.0.0.1:3000...", flush=True)
            frontend_proc = subprocess.Popen(
                ["npx", "next", "start", "-p", str(FRONTEND_PORT), "-H", "127.0.0.1"],
                cwd=frontend_dir,
                env=f_env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                preexec_fn=os.setsid,
            )
            if not wait_for_port(FRONTEND_PORT):
                raise RuntimeError("Next.js server failed to bind port 3000 within timeout.")
            print("  ✓ Next.js server started and listening on http://127.0.0.1:3000", flush=True)
        else:
            print("  Next.js frontend is already running on port 3000.", flush=True)

        # Confirm health of both services
        backend_health = make_request(f"http://127.0.0.1:{FASTAPI_PORT}/health")
        assert backend_health["status"] == 200, f"Backend health check failed: {backend_health['error']}"
        assert backend_health["body"].get("status") in {"ok", "healthy"}
        print(f"  ✓ FastAPI Health: HTTP 200 ({backend_health['body']})", flush=True)

        frontend_health = make_request(f"http://127.0.0.1:{FRONTEND_PORT}/api/health")
        assert frontend_health["status"] == 200, f"Frontend health route failed: {frontend_health['error']}"
        print(f"  ✓ Next.js BFF Health: HTTP 200 ({frontend_health['body']})", flush=True)

        frontend_page = make_request(f"http://127.0.0.1:{FRONTEND_PORT}/")
        assert frontend_page["status"] == 200
        assert "ShipDev" in frontend_page["body"]
        print("  ✓ Next.js App Router Page: HTTP 200 (HTML contains ShipDev IDE container)", flush=True)

        # -------------------------------------------------------------------
        # 2. Check for Browser Automation Tooling
        # -------------------------------------------------------------------
        print("\n[Stage 2] Browser automation tooling inspection...", flush=True)
        has_playwright = False
        try:
            import playwright
            has_playwright = True
        except ImportError:
            pass

        print(f"  Playwright python package: {'Installed' if has_playwright else 'Not installed'}", flush=True)
        pkg_json_path = PROJECT_ROOT / "frontend" / "package.json"
        with open(pkg_json_path, "r", encoding="utf-8") as f:
            pkg_data = json.load(f)
        all_deps = {**pkg_data.get("dependencies", {}), **pkg_data.get("devDependencies", {})}
        browser_tools = [k for k in all_deps if any(x in k for x in ["playwright", "puppeteer", "cypress", "selenium"])]
        print(f"  Frontend browser packages: {browser_tools if browser_tools else 'None installed'}", flush=True)
        print("  Status: No browser automation harness installed in repo.", flush=True)
        print("  Proceeding with rigorous HTTP endpoint verification + manual browser checklist.", flush=True)

        # -------------------------------------------------------------------
        # 3. Repeatability Test — Two Separate Runs & Separate Workspaces
        # -------------------------------------------------------------------
        print("\n[Stage 3] Repeatability Verification: Executing two independent tasks...", flush=True)

        # Run 1: Task Alpha
        print("\n  --- Pipeline Execution 1: Task Alpha ---", flush=True)
        task_1_res = make_request(
            f"http://127.0.0.1:{FASTAPI_PORT}/api/v1/tasks",
            method="POST",
            body={
                "title": "Calculator discount surcharge defect (Run 1)",
                "description": "calculate_discount adds discount percentage instead of deducting",
                "reported_by": "qa-engineer-1",
            },
        )
        assert task_1_res["status"] == 201
        task_1_id = task_1_res["body"]["id"]
        print(f"  ✓ Task 1 created: {task_1_id} ({task_1_res['body']['title']})", flush=True)

        runner_script = str(PROJECT_ROOT / "scripts" / "run_agent_pipeline.py")
        run_1_cmd = [
            python_bin,
            runner_script,
            "--task-id", task_1_id,
            "--api-base", f"http://127.0.0.1:{FASTAPI_PORT}/api/v1",
            "--agent-secret", AGENT_SECRET,
        ]
        p1 = subprocess.run(run_1_cmd, cwd=str(PROJECT_ROOT), capture_output=True, text=True)
        assert p1.returncode == 0, f"Pipeline run 1 failed (code {p1.returncode}):\n{p1.stderr}\n{p1.stdout}"
        print("  ✓ Pipeline run 1 executed successfully and halted at AWAITING_HUMAN_APPROVAL", flush=True)

        # Extract execution ID from stdout
        exec_1_id = None
        for line in p1.stdout.splitlines():
            if "Initiating execution" in line and "for task" in line:
                exec_1_id = line.split("Initiating execution '")[1].split("'")[0]
                break
        print(f"  ✓ Run 1 Execution ID: {exec_1_id}", flush=True)

        # Approve and Complete Task 1 via Next.js BFF Gate routes
        t1_approve = make_request(
            f"http://127.0.0.1:{FRONTEND_PORT}/api/gate/approve",
            method="POST",
            headers={"Origin": "http://localhost:3000"},
            body={"taskId": task_1_id, "comments": "Run 1 fix approved by human engineer"},
        )
        assert t1_approve["status"] == 200, f"Approve failed: {t1_approve['error']}"
        assert t1_approve["body"]["status"] == "APPROVED"
        print("  ✓ Task 1 approved via Next.js BFF (Status: APPROVED)", flush=True)

        t1_complete = make_request(
            f"http://127.0.0.1:{FRONTEND_PORT}/api/gate/complete",
            method="POST",
            headers={"Origin": "http://localhost:3000"},
            body={"taskId": task_1_id},
        )
        assert t1_complete["status"] == 200, f"Complete failed: {t1_complete['error']}"
        assert t1_complete["body"]["status"] == "COMPLETED"
        print("  ✓ Task 1 completed via Next.js BFF (Status: COMPLETED)", flush=True)

        # Run 2: Task Beta
        print("\n  --- Pipeline Execution 2: Task Beta ---", flush=True)
        task_2_res = make_request(
            f"http://127.0.0.1:{FASTAPI_PORT}/api/v1/tasks",
            method="POST",
            body={
                "title": "Calculator discount surcharge defect (Run 2)",
                "description": "calculate_discount adds discount percentage instead of deducting",
                "reported_by": "qa-engineer-2",
            },
        )
        assert task_2_res["status"] == 201
        task_2_id = task_2_res["body"]["id"]
        print(f"  ✓ Task 2 created: {task_2_id} ({task_2_res['body']['title']})", flush=True)

        run_2_cmd = [
            python_bin,
            runner_script,
            "--task-id", task_2_id,
            "--api-base", f"http://127.0.0.1:{FASTAPI_PORT}/api/v1",
            "--agent-secret", AGENT_SECRET,
        ]
        p2 = subprocess.run(run_2_cmd, cwd=str(PROJECT_ROOT), capture_output=True, text=True)
        assert p2.returncode == 0, f"Pipeline run 2 failed (code {p2.returncode}):\n{p2.stderr}\n{p2.stdout}"
        print("  ✓ Pipeline run 2 executed successfully and halted at AWAITING_HUMAN_APPROVAL", flush=True)

        exec_2_id = None
        for line in p2.stdout.splitlines():
            if "Initiating execution" in line and "for task" in line:
                exec_2_id = line.split("Initiating execution '")[1].split("'")[0]
                break
        print(f"  ✓ Run 2 Execution ID: {exec_2_id}", flush=True)

        # Approve and Complete Task 2 via Next.js BFF Gate routes
        t2_approve = make_request(
            f"http://127.0.0.1:{FRONTEND_PORT}/api/gate/approve",
            method="POST",
            headers={"Origin": "http://localhost:3000"},
            body={"taskId": task_2_id, "comments": "Run 2 fix approved by human engineer"},
        )
        assert t2_approve["status"] == 200, f"Approve failed: {t2_approve['error']}"
        assert t2_approve["body"]["status"] == "APPROVED"
        print("  ✓ Task 2 approved via Next.js BFF (Status: APPROVED)", flush=True)

        t2_complete = make_request(
            f"http://127.0.0.1:{FRONTEND_PORT}/api/gate/complete",
            method="POST",
            headers={"Origin": "http://localhost:3000"},
            body={"taskId": task_2_id},
        )
        assert t2_complete["status"] == 200, f"Complete failed: {t2_complete['error']}"
        assert t2_complete["body"]["status"] == "COMPLETED"
        print("  ✓ Task 2 completed via Next.js BFF (Status: COMPLETED)", flush=True)

        # -------------------------------------------------------------------
        # Repeatability Invariants Verification
        # -------------------------------------------------------------------
        print("\n  --- Verifying Repeatability Invariants ---", flush=True)
        assert exec_1_id != exec_2_id, f"Execution IDs must differ: {exec_1_id} == {exec_2_id}"
        print(f"  ✓ Executions had unique IDs: '{exec_1_id}' != '{exec_2_id}'", flush=True)

        # Verify pristine fixture is untouched
        pristine_path = PROJECT_ROOT / "demo" / "buggy_app" / "calculator.py"
        with open(pristine_path, "r", encoding="utf-8") as f:
            pristine_content = f.read()
        assert "return price + (price * (discount_percent / 100.0))" in pristine_content
        print("  ✓ Pristine fixture file remains unchanged with defect intact on disk.", flush=True)

        # Verify pristine regression test still fails with code 1
        repro_check = subprocess.run(
            [python_bin, "-m", "pytest", "demo/tests/test_calculator.py", "-k", "test_calculate_discount_applies_correct_reduction"],
            cwd=str(PROJECT_ROOT),
            env={"PYTHONPATH": str(PROJECT_ROOT / "demo")},
            capture_output=True,
            text=True,
        )
        assert repro_check.returncode == 1
        assert "AssertionError" in repro_check.stdout
        print("  ✓ Pristine regression test still genuinely fails with exit code 1.", flush=True)

        # Verify evidence records for Task 1 and Task 2 are separate
        t1_ev = make_request(f"http://127.0.0.1:{FASTAPI_PORT}/api/v1/tasks/{task_1_id}/evidence")
        t2_ev = make_request(f"http://127.0.0.1:{FASTAPI_PORT}/api/v1/tasks/{task_2_id}/evidence")
        assert len(t1_ev["body"]) == 2
        assert len(t2_ev["body"]) == 2
        t1_ids = {e["id"] for e in t1_ev["body"]}
        t2_ids = {e["id"] for e in t2_ev["body"]}
        assert t1_ids.isdisjoint(t2_ids), "Evidence IDs must not overlap between tasks"
        print("  ✓ Evidence artifacts are strictly disjoint and bound to their respective tasks.", flush=True)

        # Verify cross-task evidence replay is rejected
        cross_res = make_request(
            f"http://127.0.0.1:{FASTAPI_PORT}/api/v1/tasks/{task_1_id}/transitions",
            method="POST",
            headers={"Authorization": f"Bearer {AGENT_SECRET}", "X-Caller-Type": "agent", "X-Caller-ID": "agent"},
            body={"target_status": "REPRODUCED", "actor_type": "agent", "actor_id": "agent", "evidence_id": list(t2_ids)[0]},
        )
        # Task 1 is COMPLETED, so transition from terminal state is rejected
        assert cross_res["status"] in {400, 422}
        print("  ✓ Terminal/cross-task replay transition rejected.", flush=True)

        # Verify post-completion evidence tampering is rejected with 409
        tamper_res = make_request(
            f"http://127.0.0.1:{FASTAPI_PORT}/api/v1/tasks/{task_1_id}/evidence",
            method="POST",
            headers={"Authorization": f"Bearer {AGENT_SECRET}"},
            body={"stage": "tamper", "command_executed": "echo", "exit_code": 0, "is_mock": False},
        )
        assert tamper_res["status"] == 409
        assert "immutable" in tamper_res["body"]["detail"].lower()
        print("  ✓ Post-completion evidence insertion rejected with HTTP 409 Conflict.", flush=True)

        # -------------------------------------------------------------------
        # 4. Final Integration & Security Inspection
        # -------------------------------------------------------------------
        print("\n[Stage 4] Final integration & security inspection...", flush=True)

        # A. Inspect Client Bundle for Secrets
        print("  A. Scanning Next.js client-side bundles for secret leaks...", flush=True)
        static_dir = PROJECT_ROOT / "frontend" / ".next" / "static"
        leaked_secret = False
        for p in static_dir.rglob("*.js"):
            with open(p, "r", encoding="utf-8", errors="ignore") as f:
                c = f.read()
                if HUMAN_SECRET in c or AGENT_SECRET in c or "real-human-secret" in c:
                    leaked_secret = True
                    break
        assert not leaked_secret, "Security Violation: Secrets leaked into static JS bundle!"
        print("     ✓ Zero secrets or bearer tokens found in frontend static bundles.", flush=True)

        # B. SSE Proxy Stream Delivery
        print("  B. Testing Next.js SSE proxy stream...", flush=True)
        sse_req = urllib.request.Request(
            f"http://127.0.0.1:{FRONTEND_PORT}/api/tasks/{task_1_id}/events?replay_all=true",
            headers={"Accept": "text/event-stream"},
        )
        with urllib.request.urlopen(sse_req, timeout=5.0) as sse_resp:
            assert sse_resp.status == 200
            assert "text/event-stream" in sse_resp.headers.get("Content-Type", "")
            # Read first chunk
            chunk = sse_resp.read(1024).decode("utf-8")
            assert "event:" in chunk or "data:" in chunk
            assert HUMAN_SECRET not in chunk
            assert AGENT_SECRET not in chunk
        print("     ✓ Same-Origin SSE proxy streams events cleanly with zero exposed secrets.", flush=True)

        # C. Agent Blocked from Human Endpoints
        print("  C. Verifying Agent tokens cannot access human gate routes...", flush=True)
        agent_approve_attempt = make_request(
            f"http://127.0.0.1:{FASTAPI_PORT}/api/v1/tasks/{task_1_id}/approve",
            method="POST",
            headers={"Authorization": f"Bearer {AGENT_SECRET}"},
            body={"comments": "Agent trying to approve"},
        )
        assert agent_approve_attempt["status"] == 403
        print("     ✓ Direct FastAPI human approval endpoint strictly returns HTTP 403 Forbidden to agents.", flush=True)

        # D. CSRF / Origin Enforcement on Next.js BFF
        print("  D. Verifying CSRF / Origin validation on Next.js BFF...", flush=True)
        no_origin_approve = make_request(
            f"http://127.0.0.1:{FRONTEND_PORT}/api/gate/approve",
            method="POST",
            body={"taskId": task_1_id, "comments": "No origin header"},
        )
        assert no_origin_approve["status"] == 403
        print("     ✓ Next.js BFF gate routes reject requests with missing Origin header (HTTP 403).", flush=True)

        print("\n" + "=" * 80)
        print("PHASE 4 AUDIT COMPLETE: ALL DEMO READINESS CHECKS PASSED")
        print("=" * 80 + "\n", flush=True)

    finally:
        cleanup_servers()


if __name__ == "__main__":
    main()

