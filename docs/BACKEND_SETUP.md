# ShipDev Backend — Setup & Development Guide

**Lead:** Ayush (Engineer 3 — Backend, Persistence & Verification Lead)  
**Technology:** Python 3.12, FastAPI, Pydantic, SQLite (WAL mode), Pytest, HTTPX

---

## 1. Quick Start

### Prerequisites
* Python 3.12+ (tested with Python 3.12.8 64-bit on Windows 11)
* Git

### Local Environment Setup

1. **Navigate to the backend directory:**
   ```powershell
   cd C:\Users\ayush\Documents\ShipDev\backend
   ```

2. **Activate the virtual environment:**
   ```powershell
   # Windows PowerShell
   .venv\Scripts\Activate.ps1
   ```

3. **Install dependencies (if setting up fresh):**
   ```powershell
   pip install fastapi uvicorn[standard] pydantic pytest pytest-asyncio httpx
   ```

4. **Environment Variables (.env):**
   ```env
   HOST=0.0.0.0
   PORT=8000
   ENVIRONMENT=development
   DATABASE_URL=sqlite:///./shipdev.db
   FRONTEND_ORIGIN=http://localhost:3000
   API_SECRET_KEY=your-strong-agent-key-here
   HUMAN_APPROVAL_SECRET=your-strong-human-secret-here
   HUMAN_OPERATOR_IDENTITY=shipdev-operator
   ```

5. **Run the FastAPI development server:**
   ```powershell
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   * Interactive Swagger Docs: `http://localhost:8000/docs`
   * Redoc Documentation: `http://localhost:8000/redoc`
   * Health Check: `http://localhost:8000/health`
   * OpenAPI Specification: `http://localhost:8000/openapi.json`

---

## 2. Security Architecture & Human Gate Authentication

The human approval gate (`/approve`, `/reject`, `/complete`) enforces cryptographic constant-time Bearer token authentication:
* Header format: `Authorization: Bearer <HUMAN_APPROVAL_SECRET>`
* Comparison: `secrets.compare_digest(credentials.credentials, expected_secret)`
* Security Invariants:
  - Any caller passing `X-Caller-Type: human` without a valid Bearer token is rejected with `401 Unauthorized`.
  - Passing an invalid token or agent credential is rejected with `403 Forbidden`.
  - Missing or whitespace-only `HUMAN_APPROVAL_SECRET` fails closed with `500 Internal Server Error`.
  - Reviewer attribution is strictly server-derived from `HUMAN_OPERATOR_IDENTITY`. Client headers (`X-Caller-ID`) and request body fields (`reviewer_id`) are untrusted and ignored to prevent identity spoofing.
  - Direct transitions to `APPROVED` or `COMPLETED` via the generic `POST /tasks/{id}/transitions` route are blocked with `400 Bad Request`.
  - Completing an unapproved task via `/complete` is blocked with `409 Conflict`.
  - Frontend bundles and agent runtimes must **NEVER** hold `HUMAN_APPROVAL_SECRET`.

---

## 3. Running Automated Tests

All tests run asynchronously with pytest:

```powershell
Set-Location C:\Users\ayush\Documents\ShipDev\backend
.venv\Scripts\pytest.exe -v
```

### Test Suite Structure
* `tests/test_health.py` &mdash; FastAPI startup, health check endpoint, and 404 routing.
* `tests/test_state_machine.py` &mdash; Pure business logic validation for all 14 lifecycle states, failure recoveries, mock evidence rejection, and human gate security invariants.
* `tests/test_persistence.py` &mdash; SQLite database schema creation, atomic state transactions, cascading deletes, and rollback safety.
* `tests/test_api.py` &mdash; End-to-end REST API integration tests covering cryptographic human authentication, spoofing rejection, 401/403/409/422 status codes, and rejection recovery.

---

## 4. Database Architecture (SQLite)

The database engine runs SQLite in Write-Ahead Logging (`WAL`) mode with foreign key constraints enabled:
* `PRAGMA journal_mode = WAL;` (prevents database locking on concurrent agent writes)
* `PRAGMA foreign_keys = ON;`
* `PRAGMA busy_timeout = 30000;`

Database tables initialized on server startup:
* `tasks`: Stores core bug reports and workflow status (`REPORTED` &rarr; `COMPLETED`).
* `evidence`: Immutable store of reproduction logs, commands, exit codes, and patch diffs.
* `task_transitions`: Append-only audit history of every state transition with actor attribution.
* `approval_records`: Record of human reviewer approvals and rejection feedback.
