<div align="center">

# ShipDev

**The Human-Supervised AI Engineering IDE.**  
*Autonomous multi-agent bug triage, isolated sandbox reproduction, and rigorous verification — with an immutable human approval boundary.*

[![Backend Tests](https://img.shields.io/badge/backend%20tests-116%20passed-22c55e?style=flat-square&logo=pytest)](backend/tests)
[![Security Tests](https://img.shields.io/badge/security%20audit-14%2F14%20passed-22c55e?style=flat-square&logo=shield)](frontend/tests)
[![Design System](https://img.shields.io/badge/design%20system-Clay%20(Impeccable)-ff4d8b?style=flat-square)](DESIGN.md)
[![Agent Mesh](https://img.shields.io/badge/orchestration-Switch%20Network-1a3a3a?style=flat-square)](scripts/switch_bridge.py)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](#team--license)

</div>

---

### Why ShipDev?

AI coding agents write plausible code that fails silently in edge cases. **ShipDev** solves this with an uncompromised multi-agent architecture and a fail-closed human approval boundary:

1. **Autonomous Switch Agents**: Real `shipdev-triager` isolates defects; `shipdev-verifier` independently runs full test suites against candidate patches.
2. **Deterministic Sandbox**: Regression reproduction and verification execute in isolated, clean subprocess workspaces without touching production.
3. **Immutable Human Approval Gate**: State transitions to production merge are cryptographically enforced on the server. No agent can bypass human sign-off.
4. **Clay Studio IDE**: A unified, distraction-free software engineering workbench built on Clay design primitives, Geist typography, and Monaco Diff Editor.

---

### Architecture & Agent Mesh

```
Bug Report ➔ [ Switch Triager ] ➔ Sandbox Reproduction (Exit 1)
                                         ↓
Human Gate [ Approve / Reject ] ⇦ [ Switch Verifier ] ⇦ Fix Synthesis
         ↓
Ship to Main (Clean diff applied)
```

---

### Quickstart

```bash
# 1. Start the FastAPI Engine
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]" && uvicorn app.main:app --port 8000

# 2. Start the Clay Next.js IDE
cd ../frontend && npm install && npm run dev

# 3. Trigger Autonomous Switch Pipeline
python scripts/switch_bridge.py --task-id <TASK_ID>
```

---

### Automated Verification Suite

ShipDev is continuously validated against strict test suites:

- **Backend State Machine & Security**: `116 / 116 passed` (pytest: replay defense, workspace isolation, transition rules)
- **Frontend Security Boundary**: `14 / 14 passed` (anti-CSRF, parameter traversal, client-spoofing defense)
- **Design & A11y Audit**: `19 / 20` (WCAG AA contrast, reduced motion, accessible keyboard focus)

---

### Team & License

Built with craft by **Pratham** (Frontend & IDE), **Sumit** (Switch Agent Mesh), and **Ayush** (Backend & Verification Engine).  
Distributed under the MIT License.
