# ShipDev Switch Multi-Agent Integration Guide

**Target:** Sumit (Engineer 2 — Switch & Multi-Agent Orchestration Lead)  
**Backend Base URL:** `http://localhost:8000/api/v1`  
**OpenAPI Specification:** `backend/openapi.json`

---

## 1. Overview & Agent Autonomy Boundaries

Switch orchestrates specialized AI agents through the bug-fix lifecycle.
* **Agent Capabilities:** AI agents triage, start reproduction sandboxes, record failure outputs, propose code diffs, run verification tests, and advance tasks up to `AWAITING_HUMAN_APPROVAL`.
* **Agent Security Boundary:** AI agents **cannot** approve or complete tasks. Calls attempting to transition to `APPROVED` or `COMPLETED` from any agent return **`403 Forbidden`**.

---

## 2. Agent Execution Workflow & API Calls

### Step 1: Triage Agent
When a task is `REPORTED`:
1. Triage Agent analyzes report quality and identifies target repository/subsystem.
2. Advance state:
   * **`POST /api/v1/tasks/{task_id}/transitions`**
   * **Headers:** `X-Caller-Type: agent`, `X-Caller-ID: switch-triage-agent`
   * **Body:**
     ```json
     {
       "target_status": "TRIAGED",
       "actor_type": "agent",
       "actor_id": "switch-triage-agent",
       "reason": "Categorized under authentication service; repro script template identified."
     }
     ```

---

### Step 2: Reproduction Agent
1. Advance state to `REPRODUCING`:
   * **`POST /api/v1/tasks/{task_id}/transitions`**
   * **Body:** `{ "target_status": "REPRODUCING", "actor_type": "agent", "actor_id": "switch-repro-agent" }`

2. Run reproduction test in sandbox.
3. Submit reproduction evidence:
   * **`POST /api/v1/tasks/{task_id}/evidence`**
   * **Body:**
     ```json
     {
       "stage": "reproduction",
       "command_executed": "pytest tests/repro_bug.py",
       "exit_code": 1,
       "stdout": "FAIL: test_token_expiration (assert 401 == 200)",
       "stderr": "Traceback (most recent call last)...",
       "is_mock": false
     }
     ```
   * *Returns `evidence_id` (e.g. `ev_9a8b7c6d...`).*

4. Advance state to `REPRODUCED`:
   * **`POST /api/v1/tasks/{task_id}/transitions`**
   * **Body:**
     ```json
     {
       "target_status": "REPRODUCED",
       "actor_type": "agent",
       "actor_id": "switch-repro-agent",
       "evidence_id": "ev_9a8b7c6d..."
     }
     ```
   * *Note: The backend validates that `evidence_id` contains real reproduction output with non-mock execution; otherwise it rejects the transition with HTTP 400.*

---

### Step 3: Fix Agent
1. Generate fix/patch.
2. Advance state to `FIX_PROPOSED`:
   * **`POST /api/v1/tasks/{task_id}/transitions`**
   * **Body:**
     ```json
     {
       "target_status": "FIX_PROPOSED",
       "actor_type": "agent",
       "actor_id": "switch-fix-agent",
       "reason": "Applied token refresh validation patch to auth handler."
     }
     ```

---

### Step 4: Verification Agent
1. Advance state to `VERIFYING`:
   * **`POST /api/v1/tasks/{task_id}/transitions`**
   * **Body:** `{ "target_status": "VERIFYING", "actor_type": "agent", "actor_id": "switch-verify-agent" }`

2. Apply patch in isolated environment, run repro test + entire regression suite.
3. Submit verification evidence:
   * **`POST /api/v1/tasks/{task_id}/evidence`**
   * **Body:**
     ```json
     {
       "stage": "verification",
       "command_executed": "pytest tests/",
       "exit_code": 0,
       "stdout": "26 passed in 1.2s",
       "patch_diff": "--- a/auth/token.py\n+++ b/auth/token.py\n@@ -45,2 +45,4 @@\n+    if token.is_expired():\n+        refresh()",
       "is_mock": false
     }
     ```
   * *Returns `evidence_id`.*

4. Advance state to `AWAITING_HUMAN_APPROVAL`:
   * **`POST /api/v1/tasks/{task_id}/transitions`**
   * **Body:**
     ```json
     {
       "target_status": "AWAITING_HUMAN_APPROVAL",
       "actor_type": "agent",
       "actor_id": "switch-verify-agent",
       "evidence_id": "ev_..."
     }
     ```
   * *Backend enforces: `exit_code == 0`, non-empty `patch_diff`, and `is_mock == false`.*

---

### Step 5: Handling Human Rejection Loops
If the human engineer rejects the fix with feedback:
* The backend transitions the task to `REJECTED`, records human feedback in `approval_records`, and automatically bounces the task to `FIX_PROPOSED`.
* Switch can query `GET /api/v1/tasks/{task_id}/approvals` to retrieve the human feedback text and instruct the Fix Agent to re-attempt the patch addressing the human reviewer's comments.

