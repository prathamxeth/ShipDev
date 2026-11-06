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

4. **Run the FastAPI development server:**
   ```powershell
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   * Interactive Swagger Docs: `http://localhost:8000/docs`
   * Redoc Documentation: `http://localhost:8000/redoc`
   * Health Check: `http://localhost:8000/health`
   * OpenAPI Specification: `http://localhost:8000/openapi.json`

---

## 2. Running Automated Tests

All tests run asynchronously with pytest:

```powershell
Set-Location C:\Users\ayush\Documents\ShipDev\backend
.venv\Scripts\pytest.exe -v
```

### Test Suite Structure
* `tests/test_health.py` &mdash; FastAPI startup, health check endpoint, and 404 routing.
* `tests/test_state_machine.py` &mdash; Pure business logic validation for all 14 lifecycle states, failure recoveries, mock evidence rejection, and human gate security invariants.
* `tests/test_persistence.py` &mdash; SQLite database schema creation, atomic state transactions, cascading deletes, and rollback safety.
* `tests/test_api.py` &mdash; End-to-end REST API integration tests using `httpx.AsyncClient` with custom header authentication (`X-Caller-Type`, `X-Caller-ID`).

---

## 3. Database Architecture (SQLite)

The database engine runs SQLite in Write-Ahead Logging (`WAL`) mode with foreign key constraints enabled:
* `PRAGMA journal_mode = WAL;` (prevents database locking on concurrent agent writes)
* `PRAGMA foreign_keys = ON;`
* `PRAGMA busy_timeout = 30000;`

Database tables initialized on server startup:
* `tasks`: Stores core bug reports and workflow status (`REPORTED` &rarr; `COMPLETED`).
* `evidence`: Immutable store of reproduction logs, commands, exit codes, and patch diffs.
* `task_transitions`: Append-only audit history of every state transition with actor attribution.
* `approval_records`: Record of human reviewer approvals and rejection feedback.

