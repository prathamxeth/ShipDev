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

## 2. Security Invariants & Human Authentication

> [!CAUTION]
> **CRITICAL SECURITY REQUIREMENT & AUTHENTICATION SCOPE:**
> 1. **Client-Side Secret Isolation:** Browser-side JavaScript and public frontend bundles must **NEVER** contain or bundle `HUMAN_APPROVAL_SECRET` or `API_SECRET_KEY`.
> 2. **Human Gate Protection:** The human approval endpoints (`/approve`, `/reject`, `/complete`) strictly require Bearer token authentication (`Authorization: Bearer <HUMAN_APPROVAL_SECRET>`). AI agents are mathematically and programmatically prohibited from approving or completing tasks.
> 3. **Shared-Secret Proxy Scope:** The current shared-secret authorization mechanism serves as an isolated server-to-server proxy credential for hackathon and demo environments. It **does not establish a verified cryptographic human identity** (such as OAuth2/OIDC, mTLS, or WebAuthn/FIDO2) and must not be described as production-grade authentication.
> 4. **Frontend Architecture:** In Next.js, human approvals must be dispatched through server-side routes (e.g., Next.js Server Actions or Route Handlers) that inject the secret securely in server memory after authenticating the local user session.

---

## 3. TypeScript Interfaces

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

export interface TaskTransitionEvent {
  event_id: string;
  task_id: string;
  from_status: TaskStatus;
  to_status: TaskStatus;
  actor_type: "human" | "agent";
  actor_id: string;
  reason?: string;
  evidence_id?: string;
  timestamp: string;
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

## 4. Endpoints for Pratham's UI

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
  * `Authorization: Bearer <HUMAN_APPROVAL_SECRET>`
  * `X-Caller-ID: <username>` (e.g. `pratham` or `ayush`)
* **Request Body:**
  ```json
  {
    "reviewer_id": "pratham",
    "comments": "Reviewed repro logs and git diff. All verification tests pass."
  }
  ```
* **Response (200 OK):** Updated `Task` with `status: "APPROVED"`.
* **Errors:**
  * `401 Unauthorized` &mdash; Missing Bearer token.
  * `403 Forbidden` &mdash; Invalid Bearer token.
  * `409 Conflict` &mdash; Task is not in `AWAITING_HUMAN_APPROVAL` status.

### 5. Human Rejection
* **`POST /api/v1/tasks/{task_id}/reject`**
* **Required Headers:**
  * `Authorization: Bearer <HUMAN_APPROVAL_SECRET>`
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

### 6. Human Task Completion
* **`POST /api/v1/tasks/{task_id}/complete`**
* **Required Headers:**
  * `Authorization: Bearer <HUMAN_APPROVAL_SECRET>`
  * `X-Caller-ID: <username>`
* **Response (200 OK):** Updated `Task` with `status: "COMPLETED"`.
* **Errors:**
  * `409 Conflict` &mdash; Task is not in `APPROVED` status.

### 7. Real-Time Task Lifecycle Streaming (Server-Sent Events)
* **`GET /api/v1/tasks/{task_id}/events`**
* **Headers:** `Accept: text/event-stream`
* **Optional Headers:** `Last-Event-ID: <event_id>` (Automatic when using standard browser `EventSource`)
* **Optional Query Params:**
  * `?last_event_id=<event_id>` &mdash; Replay all transitions committed after this event ID.
  * `?replay_all=true` &mdash; Replay full chronological transition history from task inception before streaming live events.
* **Stream Response (`text/event-stream`):**
  * Real-time lifecycle transition events:
    ```
    id: tr_550e8400e29b41d4a716446655440000
    event: task_transition
    data: {"event_id": "tr_550e8400e29b41d4a716446655440000", "task_id": "task_123", "from_status": "VERIFYING", "to_status": "AWAITING_HUMAN_APPROVAL", "actor_type": "agent", "actor_id": "agent-verifier", "reason": "Verification suite passed", "evidence_id": "ev_abc", "timestamp": "2026-11-07T12:00:00Z"}

    ```
  * Periodic heartbeat comments (every 15s) to maintain proxy connections:
    ```
    : ping - 2026-11-07T12:00:15.123456+00:00

    ```
* **Client Disconnect & Reconnect Semantics:**
  * The backend listens for socket disconnects and automatically cleans up subscription queues.
  * If a client disconnects and reconnects, browser `EventSource` automatically sends `Last-Event-ID`. The backend deterministically replays all missed events directly from SQLite persistence before resuming live streaming.
* **Frontend React / Next.js Integration Example:**
  ```typescript
  useEffect(() => {
    const es = new EventSource(`/api/v1/tasks/${taskId}/events`);

    es.addEventListener("task_transition", (event) => {
      const payload: TaskTransitionEvent = JSON.parse(event.data);
      console.log(`Task moved from ${payload.from_status} to ${payload.to_status}`);
      // Update local state / trigger refetch
      setCurrentStatus(payload.to_status);
    });

    es.onerror = (err) => {
      console.error("SSE stream error (will automatically reconnect):", err);
    };

    return () => {
      es.close();
    };
  }, [taskId]);
  ```

---

## 5. CORS & Frontend Setup
The backend is configured with CORS enabled for `http://localhost:3000` (Next.js default) with all HTTP methods and headers permitted.
