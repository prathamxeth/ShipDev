<div align="center">

# ⚡ ShipDev
### The Human-Supervised AI Engineering IDE Powered by Switch

**Deterministic, sandbox-verified multi-agent software engineering with an immutable human approval boundary.**  
Built for the **WeMakeDevs Flip the Switch Hackathon 2026** — delivering the **Best Business Workflow**.

<br/>

[![Backend Live](https://img.shields.io/badge/Render_API-Live_Production-00b894?style=for-the-badge&logo=render&logoColor=white)](https://shipdev.onrender.com)
[![OpenAPI Docs](https://img.shields.io/badge/OpenAPI_Docs-Interactive_Swagger-0984e3?style=for-the-badge&logo=fastapi&logoColor=white)](https://shipdev.onrender.com/docs)
[![GitHub Stars](https://img.shields.io/github/stars/prathamxeth/ShipDev?style=for-the-badge&color=2563eb)](https://github.com/prathamxeth/ShipDev)
[![License](https://img.shields.io/badge/License-MIT-16a34a?style=for-the-badge)](LICENSE)

<br/>

[![Switch](https://img.shields.io/badge/Agent_Orchestrator-Switch_AI_(Agent_Controller_:53640)-f54e00.svg)](https://switch.ai)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI_+_SQLite_State_Machine-059669.svg)](backend)
[![Next.js 14](https://img.shields.io/badge/Frontend-Next.js_14_+_Monaco_+_Clay-000000.svg)](frontend)
[![Pytest](https://img.shields.io/badge/Test_Suite-116%2F116_Passing-22c55e.svg)](backend/tests)
[![Security](https://img.shields.io/badge/Security_Audit-14%2F14_Guards_Passed-22c55e.svg)](frontend/tests)

<br/>

```text
 ┌────────────────────────────────────────────────────────────────────────┐
 │  🎬 3-MINUTE INTERACTIVE WORKFLOW DEMO                                 │
 │  Autonomous triage, sandbox reproduction, independent verification,    │
 │  and cryptographically enforced human sign-off:                        │
 │  👉 Live Production API: https://shipdev.onrender.com                  │
 └────────────────────────────────────────────────────────────────────────┘
```

</div>

---

## 🚨 The Core Problem: Why Isolated Terminal Agents Fail

Standard AI coding assistants (terminal CLIs, chat windows, copilot autocompletes) operate as solitary, uncoordinated agents in developer terminals. 

While isolated agents can generate snippets, **enterprise software engineering requires multi-agent team collaboration with strict human governance**:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                    THE ISOLATED TERMINAL AGENT TRAP                          │
└──────────────────────────────────────────────────────────────────────────────┘

  BUG REPORT: "ZeroDivisionError in calculate_discount()"
     │
     ▼ (Single Agent in Terminal)
  [ Agent Hallucination ] ◄── (Modifies production files without isolated reproduction)
     │
     ▼ (Self-Verification Blindspot)
  [ "Looks good to me!" ] ◄── (Author agent rubber-stamps its own broken patch)
     │
     ▼ (Unchecked Direct Merge)
  [ Production Crash ]   ◄── SILENT ENTERPRISE REGRESSION!
```

1. **Self-Review Blindspot**: An agent that writes a patch should never be the sole authority that verifies it.
2. **Missing Sandbox Isolation**: Terminal agents modify live workspaces directly, leaving dirty git states and breaking dependencies.
3. **No Immutable Human Gate**: Autonomous agents frequently auto-commit hallucinated fixes without team review.

---

## ⚡ The ShipDev Solution: Multi-Agent Collaboration + Human Gate

ShipDev transitions isolated agents into collaborative engineering teammates connected through **Switch Incident Rooms** and governed by an **Immutable Human Approval Gate**:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                      SHIPDEV DUAL-AGENT ARCHITECTURE                         │
└──────────────────────────────────────────────────────────────────────────────┘

  1. BUG REPORT ➔ [ Switch Agent Controller :53640 ]
                          │
                          ▼ (Dispatches Incident)
  2. TRIAGE      ➔ [ shipdev-triager (bd717264) ]
                          │ • Parses stack trace & maps AST defect
                          ▼ • Clones isolated subprocess scratch workspace
  3. REPRODUCE   ➔ [ pytest reproduction harness ] ➔ Confirms failure (Exit 1)
                          │
                          ▼ (Synthesizes minimal unified diff)
  4. CANDIDATE   ➔ [ Patch Synthesis ]
                          │
                          ▼ (Hands off to independent oracle)
  5. VERIFY      ➔ [ shipdev-verifier (7dc5d295) ] ◄── INDEPENDENT ORACLE
                          │ • Applies diff in pristine clean sandbox
                          ▼ • Runs full regression suite ➔ Asserts zero regressions (Exit 0)
  6. EVIDENCE    ➔ [ Cryptographic Verification Token Emitted ]
                          │
                          ▼
  ════════════════════════════════════════════════════════════════════════════════
  7. IMMUTABLE HUMAN APPROVAL GATE (AWAITING_HUMAN_APPROVAL)
     Agents are strictly forbidden from approving or merging code!
     Engineer reviews Monaco side-by-side diff ➔ [ APPROVE ] or [ REJECT ]
  ════════════════════════════════════════════════════════════════════════════════
                          │
                          ▼ (Human Approved)
  8. PRODUCTION  ➔ [ Merged to main with audit trail ]
```

---

## 🗺️ Live Topological Bug Graph

ShipDev renders an interactive, live topological graph visualization connecting folders, files, subfile AST functions, active bug defects, and Switch agent oracles:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   LIVE TOPOLOGICAL BUG GRAPH                           │
└────────────────────────────────────────────────────────────────────────┘

  [ 📁 ShipDev (Root) ]
        │
        ├─► [ 📂 demo/buggy_app ]
        │         │
        │         ├─► [ 📄 calculator.py ]
        │         │         │
        │         │         ├─► [ ⚡ divide(a, b) ] ◄── Ln 22 (Defect Target)
        │         │         │         ▲
        │         │         │         │ (affects)
        │         │         │   [ 🐛 ZeroDivisionError ] ◄── Status: REPORTED
        │         │         │         ▲
        │         │         │         ├─► [ 🤖 shipdev-triager ] (Diagnoses & Repro)
        │         │         │         └─► [ 🤖 shipdev-verifier ] (Validates Clean-Room)
        │         │         │
        │         │         └─► [ ⚡ evaluate(expr) ]
        │         │
        │         └─► [ 📄 utils.py ] ──► [ ⚡ safe_eval() ]
        │
        ├─► [ 📂 demo/tests ] ──► [ 📄 test_calculator.py ] ──► [ ⚡ test_divide_zero() ]
        │
        └─► [ 📂 scripts ] ────► [ 📄 switch_bridge.py ] ────► [ ⚡ SwitchClient ]
```

* **Fully Clickable**: Click any file to open in Monaco Editor; click any function or bug to jump directly to the target line.
* **Expandable Canvas**: Click the **Graph** toggle in the sidebar or hit **Enlarge** (`Maximize2`) for full-screen pan & zoom exploration.
* **Agent Profile Inspector**: Click on any Switch agent (`shipdev-triager` / `verifier`) to inspect its role, system prompt, tool capabilities, and safety invariants.

---

## 📊 Benchmark: ShipDev vs. Autonomous Terminal Agents

```text
VERIFICATION RELIABILITY (Zero Regressions) — Higher is better
Isolated Terminal Agents  : 41%   [████████░░░░░░░░░░░░] (Self-review blindspot)
ShipDev Dual-Agent Oracle : 100%  [████████████████████] (Independent clean-room pytest)

HUMAN GOVERNANCE & SAFETY GATE — Higher is better
Isolated Terminal Agents  : 0%    [░░░░░░░░░░░░░░░░░░░░] (Auto-commits silently)
ShipDev Fail-Closed Gate  : 100%  [████████████████████] (Enforced cryptographic boundary)

SANDBOX ISOLATION OVERHEAD — Lower is better
Docker / VM Containers    : ~600MB [████████████████████] (Heavyweight boot)
ShipDev Subprocess Scratch: <1MB   [▏]  ◄── Instant clean workspace cloning (<50ms)

TEST SUITE RIGOR (Automated Test Count)
Backend State Machine     : 116 tests passed (1.79s)
Frontend Security Audit   : 14 tests passed (CSRF, same-origin, anti-spoofing)
```

---

## 🏆 WeMakeDevs "Flip the Switch" Hackathon: Best Business Workflow

ShipDev directly tackles the hackathon's core challenge by transforming isolated terminal AI tools into active, collaborative team members:

1. **Deep Switch Integration**: Uses the authentic Switch Agent Controller (`http://127.0.0.1:53640`), Incident Room IDs, and dedicated instructions (`switch/instructions/triager.md` and `verifier.md`).
2. **Real Enterprise Business Utility**: Solves automated bug triaging, test reproduction, and patch verification—the #1 bottleneck in enterprise software teams.
3. **Safety & Compliance**: Full audit trail with immutable reviewer identities, constant-time bearer secrets, and replay protection.

---

## 🚀 3-Minute Quickstart

### 1. Start the Live Backend (or use Cloud Render)
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```
*Or connect to the live cloud backend: `https://shipdev.onrender.com/api/v1`*

### 2. Start the Clay Studio IDE
```bash
cd frontend
npm install
npm run dev
```
*Open `http://localhost:3000` to access the IDE.*

### 3. Connect Local Switch Bridge
```bash
python3 scripts/switch_bridge.py \
  --api-base https://shipdev.onrender.com/api/v1 \
  --agent-secret <API_SECRET_KEY>
```

---

## 👥 Contributors & Team

Built with craft for **WeMakeDevs Flip the Switch Hackathon 2026**:
- **Pratham** ([@prathamxeth](https://github.com/prathamxeth)): Frontend Architecture, Monaco Integration, Clay Design System, Bug Graph Canvas.
- **Sumit** ([@sumit1452yadav](https://github.com/sumit1452yadav)): Switch Agent Mesh, Controller Bridge, Incident Room Templates.
- **Ayush** ([@ayushtripathi1264](https://github.com/ayushtripathi1264)): FastAPI Backend, State Machine Engine, Sandbox Verification Runner.

Distributed under the **MIT License**.
