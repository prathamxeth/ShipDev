# ShipDev Frontend Integration Contract

**Target:** Pratham (Engineer 1 — Frontend & Integration Lead)  
**Stack:** Next.js + TypeScript  
**Backend Base URL:** `http://localhost:8000/api/v1`  
**OpenAPI Specification:** `backend/openapi.json` or `http://localhost:8000/openapi.json`

---

## 1. Overview & Human Supervised Flow

ShipDev requires a human engineer to review AI-generated reproduction evidence and code diffs before approving or rejecting completion.

### Task Lifecycle States
```
REPORTED → TRIAGED → REPRODUCING → REPRODUCED → FIX_PROPOSED → VERIFYING → AWAITING_HUMAN_APPROVAL → APPROVED → COMPLETED
```
* **Failure / Rejection States:**
  * `TRIAGE_FAILED`
  * `REPRODUCTION_FAILED`
  * `VERIFICATION_FAILED`
  * `REJECTED` (Human rejected fix; automatically bounces back to `FIX_PROPOSED`)
  * `FAILED` (Terminal cancellation)

---

## 2. TypeScript Interfaces

```typescript
export type TaskStatus =
  | "REPORTED"
  | "TRIAGED"
  | "REPRODUCING"
  | "REPRODUCED"
  | "FIX_PROPOSED"
  | "VERIFYING"
  | "AWAITING_HUMAN_APPROVAL"
  | "APPROVED"
  | "COMPLETED"
  | "TRIAGE_FAILED"
  | "REPRODUCTION_FAILED"
  | "VERIFICATION_FAILED"
  | "REJECTED"
  | "FAILED";

export interface Task {
  id: string;
  title: string;
  description: string;
  reported_by: string;
  input_source: "text" | "wispr_flow";
  status: TaskStatus;
  repository_url?: string;
  branch_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Evidence {
  id: string;
  task_id: string;
  stage: "reproduction" | "verification" | "test_run";
  command_executed: string;
  exit_code: number;
  stdout?: string;
  stderr?: string;
  patch_diff?: string;
  metadata_json?: string;
  is_mock: boolean;
  recorded_at: string;
}

export interface TransitionHistory {
  id: string;
  task_id: string;
  from_status: TaskStatus;
  to_status: TaskStatus;
  actor_type: "human" | "agent";
  actor_id: string;
  reason?: string;
  evidence_id?: string;
  created_at: string;
}

export interface ApprovalRecord {
  id: string;
  task_id: string;
  decision: "approved" | "rejected";
  reviewer_id: string;
  feedback?: string;
  decided_at: string;
}
```

---

## 3. Endpoints for Pratham's UI

### 1. Submit Bug Report (Text or Wispr Flow Voice)
* **`POST /api/v1/tasks`**
* **Headers:** `Content-Type: application/json`
* **Request Body:**
  ```json
  {
    "title": "Authentication token expired on page refresh",
    "description": "Wispr Flow voice transcript or typed description of the bug",
    "reported_by": "pratham",
    "input_source": "wispr_flow"
  }
  ```
* **Response (201 Created):** Returns `Task` object.

### 2. List Tasks (Dashboard)
* **`GET /api/v1/tasks`**
* **Optional Query Param:** `?status=AWAITING_HUMAN_APPROVAL`
* **Response (200 OK):** `Task[]`

### 3. Task Details & Evidence Inspector
* **`GET /api/v1/tasks/{task_id}`** &mdash; Returns `Task`
* **`GET /api/v1/tasks/{task_id}/evidence`** &mdash; Returns `Evidence[]` (shows reproduction terminal logs and verification diffs)
* **`GET /api/v1/tasks/{task_id}/history`** &mdash; Returns `TransitionHistory[]` (shows timeline of agent actions)
* **`GET /api/v1/tasks/{task_id}/approvals`** &mdash; Returns `ApprovalRecord[]`

### 4. Human Approval Gate
* **`POST /api/v1/tasks/{task_id}/approve`**
* **Required Headers:**
  * `X-Caller-Type: human`
  * `X-Caller-ID: <username>` (e.g. `pratham` or `ayush`)
* **Request Body:**
  ```json
  {
    "reviewer_id": "pratham",
    "comments": "Reviewed repro logs and git diff. All verification tests pass."
  }
  ```
* **Response (200 OK):** Updated `Task` with `status: "APPROVED"`.
* **Security:** Attempting to call this endpoint without `X-Caller-Type: human` returns **`403 Forbidden`**.

### 5. Human Rejection
* **`POST /api/v1/tasks/{task_id}/reject`**
* **Required Headers:**
  * `X-Caller-Type: human`
  * `X-Caller-ID: <username>`
* **Request Body:**
  ```json
  {
    "reviewer_id": "pratham",
    "feedback": "Patch breaks backward compatibility with old API clients.",
    "return_to": "FIX_PROPOSED"
  }
  ```
* **Response (200 OK):** Updated `Task` returned to `FIX_PROPOSED` for the fix agent to re-attempt.

---

## 4. CORS & Frontend Setup
The backend is already configured with CORS enabled for `http://localhost:3000` (Next.js default) with all HTTP methods and headers permitted.

