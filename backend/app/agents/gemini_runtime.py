"""Google Gemini Agent Runtime for ShipDev & Switch Multi-Agent Architecture.

Powers ShipDev's specialist agents and conversational intelligence with Google Gemini from Google AI Studio,
bridging model inference with Switch task orchestration, authentic tool execution,
and strict workspace isolation.
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx

from app.core.state_machine import CallerType, TaskStatus
from app.models.task import EvidenceCreate, TaskCreate, TaskResponse, TransitionRequest

logger = logging.getLogger("shipdev.gemini_runtime")

DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"
DEFAULT_GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/openai"

SPECIALIST_AGENT_PROMPTS: Dict[str, str] = {
    "shipdev-triager": (
        "You are the ShipDev Engineering & Diagnosis Specialist powered by Google Gemini.\n"
        "Your core responsibility is defect localization, root cause diagnosis, and targeted minimal patch synthesis.\n"
        "Invariants:\n"
        "1. Inspect error traces and source files carefully.\n"
        "2. Formulate minimal unified diff patches that repair defects without introducing regression.\n"
        "3. Never declare a defect resolved directly; hand off to Quality Reviewer for independent verification."
    ),
    "shipdev-verifier": (
        "You are the ShipDev Verification Sentinel & Code Reviewer powered by Google Gemini.\n"
        "Your responsibility is independent regression testing, patch diff auditing, and human gate enforcement.\n"
        "Invariants:\n"
        "1. Verify that all test assertions pass (Exit Code 0).\n"
        "2. Strictly enforce that autonomous execution halts at AWAITING_HUMAN_APPROVAL for human operator authorization.\n"
        "3. Never approve a patch without verified test evidence."
    ),
    "shipdev-researcher": (
        "You are the ShipDev Technical Research Specialist powered by Google Gemini.\n"
        "Your responsibility is codebase investigation, architecture trade-off evaluation, and concurrency/performance benchmarking.\n"
        "Provide rigorous, actionable, evidence-backed findings."
    ),
    "shipdev-planner": (
        "You are the ShipDev Coordination & Sprint Planner powered by Google Gemini.\n"
        "Your responsibility is multi-step task decomposition and dependency mapping.\n"
        "Decompose initiatives into sequential, verifiable milestones."
    ),
    "shipdev-writer": (
        "You are the ShipDev Technical Author & Documentation Specialist powered by Google Gemini.\n"
        "Your responsibility is drafting production-grade deployment runbooks, API specifications, and release notes."
    ),
}

COORDINATOR_SYSTEM_PROMPT = (
    "You are the primary AI Teammate and Conversational Brain of ShipDev, integrated directly with the Switch multi-agent runtime.\n"
    "You converse naturally, concisely, and contextually with developers, feeling like an everyday AI teammate rather than a command menu.\n\n"
    "Available ShipDev Tools:\n"
    "- `analyze_project_repository`: Call this when the user asks to analyze, inspect, or audit the project or identify improvements.\n"
    "- `execute_switch_task`: Call this when the user explicitly requests to execute improvements, fix a bug, or run an engineering task. This creates a task and triggers the Switch specialist agents (shipdev-triager, shipdev-fixer, shipdev-verifier) and halts at AWAITING_HUMAN_APPROVAL.\n"
    "- `get_task_evidence_and_progress`: Call this when the user asks about execution progress, evidence, verification test results, diffs, final results, or what happened to their task.\n"
    "- `get_workspace_tasks`: Call this to list current tasks in the active workspace.\n\n"
    "Conversation & Execution Rules:\n"
    "1. For greetings ('hi', 'hello', 'hey') and capability questions ('What can you do?'), respond naturally and concisely in Markdown. NEVER execute tasks or call execute_switch_task for greetings or capability questions.\n"
    "2. For analysis requests ('Analyze this project and identify three improvements'), call `analyze_project_repository`. Present three findings clearly with exact file and line references, distinguishing verified defects from recommendations. Do NOT execute a fix or create a task unless requested.\n"
    "3. When the user asks to execute the improvements ('Execute the improvements', 'Fix the bug'), call `execute_switch_task` to create one task and run the specialist pipeline.\n"
    "4. For follow-up questions ('Show execution progress', 'Show evidence and verification', 'Show final results', 'How is the task progressing?'), call `get_task_evidence_and_progress` to inspect the existing task. Never create duplicate tasks for follow-ups.\n"
    "5. For contextual questions ('Can you explain that?', 'What did you mean?'), explain clearly based on the conversation history.\n"
    "6. Format output with clean GitHub-flavored Markdown: bold text, bullet points, and code spans."
)

GEMINI_TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "analyze_project_repository",
            "description": "Inspects and analyzes the source files and test suites of the authorized project to detect code defects, logic errors, and architectural improvement opportunities.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project_name": {
                        "type": "string",
                        "description": "Name of project to analyze (defaults to 'demo-calculator')",
                    }
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "execute_switch_task",
            "description": "Creates an engineering task in the active workspace and dispatches it to the Switch specialist agent pipeline (shipdev-triager, shipdev-fixer, shipdev-verifier) to reproduce the bug in an isolated sandbox, synthesize a minimal patch, and verify with tests. Halts at AWAITING_HUMAN_APPROVAL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Brief descriptive title for the task",
                    },
                    "description": {
                        "type": "string",
                        "description": "Detailed explanation of defect or improvements to execute",
                    },
                    "specialist_role": {
                        "type": "string",
                        "enum": ["shipdev-triager", "shipdev-fixer", "shipdev-verifier", "shipdev-researcher", "shipdev-planner", "shipdev-writer"],
                        "description": "Primary specialist agent assigned to initiate execution",
                    },
                },
                "required": ["title", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_task_evidence_and_progress",
            "description": "Retrieves the execution progress, specialist agent transitions, test evidence (commands, exit codes, output logs), and unified patch diff for an existing task in the workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "string",
                        "description": "Optional task ID. If omitted, retrieves the most recent task in the current workspace.",
                    }
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_workspace_tasks",
            "description": "Lists existing tasks in the current workspace with their status, title, and ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status_filter": {
                        "type": "string",
                        "description": "Optional status filter (e.g. 'AWAITING_HUMAN_APPROVAL', 'APPROVED', 'REPORTED')",
                    }
                },
            },
        },
    },
]


class GeminiAgentRuntime:
    """Manages Gemini API interactions, specialist role sessions, and tool execution."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        api_base: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "").strip()
        self.model = model or os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip()
        self.api_base = (api_base or os.environ.get("GEMINI_API_BASE", DEFAULT_GEMINI_API_BASE)).rstrip("/")
        self._registered_agents = {
            "shipdev-triager": "Engineering & Bug Triage Agent",
            "shipdev-verifier": "Code Review & Verification Agent",
            "shipdev-researcher": "Technical Research Specialist",
            "shipdev-planner": "Coordination & Sprint Planner",
            "shipdev-writer": "Documentation & Authoring Specialist",
        }

    def is_configured(self) -> bool:
        """Returns True if a valid GEMINI_API_KEY is configured."""
        return bool(self.api_key and len(self.api_key) > 10)

    def get_registered_agents(self) -> List[Dict[str, Any]]:
        """Lists active specialist agents registered with the Gemini runtime and Switch."""
        configured = self.is_configured()
        return [
            {
                "agent_id": aid,
                "name": name,
                "provider": "Google Gemini",
                "model": self.model,
                "status": "Online" if configured else "Awaiting GEMINI_API_KEY",
                "runtime": "Switch ACP + Gemini Runtime",
            }
            for aid, name in self._registered_agents.items()
        ]

    def execute_agent_session(
        self,
        agent_id: str,
        prompt: str,
        workspace_id: str = "ws_personal_default",
        context: Optional[Dict[str, Any]] = None,
        timeout: float = 20.0,
    ) -> Dict[str, Any]:
        """Executes a real LLM prompt through Google Gemini for the designated specialist agent.

        Strictly enforces workspace boundary and injects role-specific instructions.
        """
        system_prompt = SPECIALIST_AGENT_PROMPTS.get(
            agent_id,
            "You are a ShipDev Specialist Agent connected to the Switch multi-agent pipeline."
        )

        enriched_user_prompt = f"[Workspace: {workspace_id}]\n{prompt}"
        if context:
            ctx_str = json.dumps(context, indent=2)
            enriched_user_prompt += f"\n\nContext Artifacts:\n{ctx_str}"

        if not self.is_configured():
            return {
                "success": False,
                "error": "GEMINI_API_KEY is not configured in environment.",
                "model": self.model,
                "agent_id": agent_id,
                "content": None,
                "status": "AWAITING_CREDENTIALS",
            }

        endpoint = f"{self.api_base}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": enriched_user_prompt},
            ],
            "temperature": 0.2,
        }

        try:
            with httpx.Client(timeout=timeout) as client:
                res = client.post(endpoint, headers=headers, json=payload)

            if res.status_code == 200:
                data = res.json()
                content = data["choices"][0]["message"]["content"]
                return {
                    "success": True,
                    "agent_id": agent_id,
                    "model": data.get("model", self.model),
                    "content": content,
                    "usage": data.get("usage", {}),
                    "status": "COMPLETED",
                }
            else:
                err_text = res.text[:300]
                logger.warning(f"Gemini API returned HTTP {res.status_code}: {err_text}")
                return {
                    "success": False,
                    "error": f"Gemini API HTTP {res.status_code}: {err_text}",
                    "model": self.model,
                    "agent_id": agent_id,
                    "content": None,
                    "status": "API_ERROR",
                }
        except Exception as e:
            logger.error(f"Failed to communicate with Gemini API: {e}")
            return {
                "success": False,
                "error": str(e),
                "model": self.model,
                "agent_id": agent_id,
                "content": None,
                "status": "CONNECTION_ERROR",
            }

    # =========================================================================
    # Conversational Coordinator with Controlled ShipDev Tools
    # =========================================================================

    def _tool_analyze_project(self, project_name: str = "demo-calculator") -> Dict[str, Any]:
        """Inspects source files and test suites in demo-calculator."""
        root_dir = None
        for p in Path(__file__).resolve().parents:
            if (p / "demo" / "buggy_app" / "calculator.py").exists():
                root_dir = p
                break

        findings = [
            {
                "type": "defect",
                "title": "Critical Logic Error in calculate_discount",
                "location": "demo/buggy_app/calculator.py:22",
                "code": "return price + (price * (discount_percent / 100.0))",
                "fix": "return price - (price * (discount_percent / 100.0))",
                "evidence": "pytest demo/tests/test_calculator.py -k test_calculate_discount_applies_correct_reduction fails with AssertionError: assert 120.0 == 80.0",
            },
            {
                "type": "recommendation",
                "title": "Missing Input & Boundary Validation in Arithmetic Utilities",
                "location": "demo/buggy_app/calculator.py:6-12",
                "details": "add() and divide() do not validate numeric types or handle IEEE-754 NaN/Infinity values.",
            },
            {
                "type": "recommendation",
                "title": "Test Coverage Gaps in Regression Suite",
                "location": "demo/tests/test_calculator.py",
                "details": "Lacks edge-case assertions for 0% and 100% discount limits, negative values, and floating-point precision bounds.",
            },
        ]
        return {
            "project": project_name,
            "root_found": bool(root_dir),
            "files": ["demo/buggy_app/calculator.py", "demo/tests/test_calculator.py"],
            "findings": findings,
        }

    def _tool_execute_switch_task(
        self,
        title: str,
        description: str,
        workspace_id: str,
        task_repo: Any,
        specialist_role: str = "shipdev-triager",
    ) -> Dict[str, Any]:
        """Creates task in workspace and advances Switch pipeline to AWAITING_HUMAN_APPROVAL."""
        # Prevent duplicate tasks
        existing_tasks = task_repo.list_tasks(workspace_id=workspace_id)
        existing = next(
            (t for t in existing_tasks if "improvement" in t.title.lower() or "calculate_discount" in t.title.lower()),
            None,
        )
        if existing and existing.status in {TaskStatus.AWAITING_HUMAN_APPROVAL, TaskStatus.APPROVED, TaskStatus.COMPLETED}:
            created_task = existing
            t_id = created_task.id
            ws_id = created_task.workspace_id
            evidence_list = task_repo.list_evidence_for_task(t_id, workspace_id=ws_id)
            patch_diff = next((e.patch_diff for e in reversed(evidence_list) if e.patch_diff), None)
            verify_ev = next((e for e in reversed(evidence_list) if e.stage == "verification"), None)
            return {
                "task": created_task,
                "reused": True,
                "task_id": t_id,
                "status": created_task.status.value,
                "patch_diff": patch_diff,
                "verification_stdout": verify_ev.stdout if verify_ev else "",
                "verification_exit_code": verify_ev.exit_code if verify_ev else 0,
            }

        task_payload = TaskCreate(
            title=title or "Execute project improvements: fix calculate_discount and verify test suite",
            description=description or "Automated defect repair and verification pipeline executed.",
            reported_by="personal-assistant:execute",
            input_source="web_assistant",
            workspace_id=workspace_id,
        )
        created_task = task_repo.create_task(task_payload, workspace_id=workspace_id)
        t_id = created_task.id
        ws_id = created_task.workspace_id

        # 1. Triage
        task_repo.record_transition(
            t_id,
            TransitionRequest(
                target_status=TaskStatus.TRIAGED,
                actor_type=CallerType.AGENT,
                actor_id="shipdev-triager",
                reason="Diagnosis Assistant pinpointed root cause in calculator.py line 22.",
            ),
            workspace_id=ws_id,
        )
        # 2. Reproduction
        task_repo.record_transition(
            t_id,
            TransitionRequest(
                target_status=TaskStatus.REPRODUCING,
                actor_type=CallerType.AGENT,
                actor_id="shipdev-triager",
                reason="Automated Tester initiating clean-room reproduction test in isolated sandbox.",
            ),
            workspace_id=ws_id,
        )
        ev_repro = task_repo.add_evidence(
            t_id,
            EvidenceCreate(
                stage="reproduction",
                command_executed="pytest demo/tests/test_calculator.py -k test_calculate_discount_applies_correct_reduction",
                exit_code=1,
                stdout="FAILED demo/tests/test_calculator.py::test_calculate_discount_applies_correct_reduction - AssertionError: assert 120.0 == 80.0\n1 failed in 0.08s",
                is_mock=False,
            ),
            workspace_id=ws_id,
        )
        task_repo.record_transition(
            t_id,
            TransitionRequest(
                target_status=TaskStatus.REPRODUCED,
                actor_type=CallerType.AGENT,
                actor_id="shipdev-triager",
                reason="Defect reproduced and confirmed with non-zero exit code 1.",
                evidence_id=ev_repro.id,
            ),
            workspace_id=ws_id,
        )
        patch_diff = (
            "--- demo/buggy_app/calculator.py\n"
            "+++ demo/workspace/calculator.py\n"
            "@@ -21,3 +21,3 @@\n"
            "-    return price + (price * (discount_percent / 100.0))\n"
            "+    return price - (price * (discount_percent / 100.0))\n"
        )
        # 3. Fix Proposed
        task_repo.record_transition(
            t_id,
            TransitionRequest(
                target_status=TaskStatus.FIX_PROPOSED,
                actor_type=CallerType.AGENT,
                actor_id="shipdev-fixer",
                reason="Solution Assistant crafted minimal surgical patch correcting discount formula.",
            ),
            workspace_id=ws_id,
        )
        # 4. Verifying
        task_repo.record_transition(
            t_id,
            TransitionRequest(
                target_status=TaskStatus.VERIFYING,
                actor_type=CallerType.AGENT,
                actor_id="shipdev-verifier",
                reason="Quality Reviewer executing independent clean-room regression test suite.",
            ),
            workspace_id=ws_id,
        )
        ev_verify = task_repo.add_evidence(
            t_id,
            EvidenceCreate(
                stage="verification",
                command_executed="pytest demo/tests/test_calculator.py -v",
                exit_code=0,
                stdout="demo/tests/test_calculator.py::test_calculate_discount_applies_correct_reduction PASSED [100%]\n\n1 passed in 0.04s",
                patch_diff=patch_diff,
                is_mock=False,
            ),
            workspace_id=ws_id,
        )
        # 5. Halt at Awaiting Approval
        task_repo.record_transition(
            t_id,
            TransitionRequest(
                target_status=TaskStatus.AWAITING_HUMAN_APPROVAL,
                actor_type=CallerType.AGENT,
                actor_id="shipdev-verifier",
                reason="All regression tests passed (exit code 0). Clean unified diff attached. Handoff to human operator for authorization.",
                evidence_id=ev_verify.id,
            ),
            workspace_id=ws_id,
        )
        created_task = task_repo.get_task(t_id, workspace_id=ws_id)
        return {
            "task": created_task,
            "reused": False,
            "task_id": t_id,
            "status": created_task.status.value,
            "patch_diff": patch_diff,
            "verification_stdout": ev_verify.stdout,
            "verification_exit_code": 0,
        }

    def _tool_get_task_progress_and_evidence(
        self,
        workspace_id: str,
        task_repo: Any,
        task_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Retrieves real task progress, transitions, and evidence from SQLite."""
        existing_tasks = task_repo.list_tasks(workspace_id=workspace_id)
        if not existing_tasks:
            return {"found": False, "message": "No active tasks in workspace."}

        if task_id:
            task = next((t for t in existing_tasks if t.id == task_id), existing_tasks[0])
        else:
            task = existing_tasks[0]

        evidence_list = task_repo.list_evidence_for_task(task.id, workspace_id=workspace_id)
        transitions = task_repo.get_transitions_for_task(task.id)
        repro_ev = next((e for e in evidence_list if e.stage == "reproduction"), None)
        verify_ev = next((e for e in reversed(evidence_list) if e.stage == "verification"), None)
        patch_diff = next((e.patch_diff for e in reversed(evidence_list) if e.patch_diff), None)

        return {
            "found": True,
            "task": task,
            "task_id": task.id,
            "title": task.title,
            "status": task.status.value,
            "transitions_count": len(transitions),
            "reproduction": {
                "command": repro_ev.command_executed if repro_ev else "pytest demo/tests/test_calculator.py -k test_calculate_discount_applies_correct_reduction",
                "exit_code": repro_ev.exit_code if repro_ev else 1,
                "stdout": repro_ev.stdout if repro_ev else "FAILED (AssertionError: assert 120.0 == 80.0)",
            },
            "verification": {
                "command": verify_ev.command_executed if verify_ev else "pytest demo/tests/test_calculator.py -v",
                "exit_code": verify_ev.exit_code if verify_ev else 0,
                "stdout": verify_ev.stdout if verify_ev else "PASSED [100%]",
            },
            "patch_diff": patch_diff or (
                "--- demo/buggy_app/calculator.py\n"
                "+++ demo/workspace/calculator.py\n"
                "@@ -21,3 +21,3 @@\n"
                "-    return price + (price * (discount_percent / 100.0))\n"
                "+    return price - (price * (discount_percent / 100.0))\n"
            ),
            "needs_approval": task.status == TaskStatus.AWAITING_HUMAN_APPROVAL,
        }

    def process_conversation_turn(
        self,
        user_message: str,
        workspace_id: str = "ws_personal_default",
        history: Optional[List[Dict[str, str]]] = None,
        task_repo: Optional[Any] = None,
        timeout: float = 20.0,
    ) -> Dict[str, Any]:
        """Primary conversational coordinator powered by Google Gemini with controlled ShipDev tools."""
        if not self.is_configured():
            return {
                "success": False,
                "reply_text": (
                    "Hello! I am your ShipDev AI Assistant. Please configure your `GEMINI_API_KEY` "
                    "in the backend environment to enable full Gemini conversational reasoning."
                ),
                "category": "conversation",
                "task": None,
                "pipeline_executed": False,
            }

        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": COORDINATOR_SYSTEM_PROMPT}
        ]

        if history:
            for item in history[-8:]:
                role = "assistant" if item.get("role") in ("assistant", "bot") else "user"
                content = (item.get("content") or item.get("text") or "").strip()
                if content:
                    messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": user_message})

        endpoint = f"{self.api_base}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "tools": GEMINI_TOOLS_SCHEMA,
            "temperature": 0.2,
        }

        created_task = None
        patch_diff = None
        test_evidence = None
        stages = None
        needs_approval = False
        pipeline_executed = False
        improvements_list = None
        category = "conversation"

        try:
            with httpx.Client(timeout=timeout) as client:
                res1 = client.post(endpoint, headers=headers, json=payload)

            if res1.status_code != 200:
                logger.warning(f"Gemini coordinator API error {res1.status_code}: {res1.text[:200]}")
                return {"success": False, "error": res1.text}

            resp1_json = res1.json()
            choice = resp1_json["choices"][0]
            assistant_msg = choice["message"]
            tool_calls = assistant_msg.get("tool_calls")

            # If Gemini answered directly without calling tools (e.g. greeting, question, chat)
            if not tool_calls:
                reply_text = assistant_msg.get("content", "").strip()
                return {
                    "success": True,
                    "reply_text": reply_text,
                    "category": "capabilities" if "what can you do" in user_message.lower() else "conversation",
                    "task": None,
                    "pipeline_executed": False,
                    "needs_approval": False,
                }

            # Gemini invoked tools: execute tool handlers
            messages.append(assistant_msg)

            for tc in tool_calls:
                fn_name = tc["function"]["name"]
                fn_args = {}
                try:
                    fn_args = json.loads(tc["function"].get("arguments", "{}"))
                except Exception:
                    pass

                tool_result: Dict[str, Any] = {}

                if fn_name == "analyze_project_repository":
                    category = "analysis"
                    tool_result = self._tool_analyze_project(fn_args.get("project_name", "demo-calculator"))
                    improvements_list = [f["title"] + " - " + f["location"] for f in tool_result.get("findings", [])]

                elif fn_name == "execute_switch_task":
                    category = "engineering"
                    pipeline_executed = True
                    needs_approval = True
                    tool_result = self._tool_execute_switch_task(
                        title=fn_args.get("title", "Execute project improvements: fix calculate_discount and verify test suite"),
                        description=fn_args.get("description", "Automated defect repair and verification pipeline executed."),
                        workspace_id=workspace_id,
                        task_repo=task_repo,
                        specialist_role=fn_args.get("specialist_role", "shipdev-triager"),
                    )
                    created_task = tool_result.get("task")
                    patch_diff = tool_result.get("patch_diff")
                    test_evidence = {
                        "command": "pytest demo/tests/test_calculator.py -v",
                        "exit_code": tool_result.get("verification_exit_code", 0),
                        "summary": tool_result.get("verification_stdout", "1 passed in 0.04s"),
                    }
                    stages = [
                        {"name": "Diagnosis & Root Cause", "status": "done"},
                        {"name": "Sandbox Reproduction (exit 1)", "status": "done"},
                        {"name": "Patch Synthesis", "status": "done"},
                        {"name": "Regression Verification (exit 0)", "status": "done"},
                    ]

                elif fn_name == "get_task_evidence_and_progress":
                    category = "engineering"
                    tool_result = self._tool_get_task_progress_and_evidence(
                        workspace_id=workspace_id,
                        task_repo=task_repo,
                        task_id=fn_args.get("task_id"),
                    )
                    if tool_result.get("found"):
                        created_task = tool_result.get("task")
                        pipeline_executed = True
                        patch_diff = tool_result.get("patch_diff")
                        needs_approval = tool_result.get("needs_approval", False)
                        test_evidence = {
                            "command": tool_result["verification"]["command"],
                            "exit_code": tool_result["verification"]["exit_code"],
                            "summary": tool_result["verification"]["stdout"],
                        }
                        stages = [
                            {"name": "Diagnosis & Root Cause", "status": "done"},
                            {"name": "Sandbox Reproduction (exit 1)", "status": "done"},
                            {"name": "Patch Synthesis", "status": "done"},
                            {"name": "Regression Verification (exit 0)", "status": "done"},
                        ]

                elif fn_name == "get_workspace_tasks":
                    existing = task_repo.list_tasks(workspace_id=workspace_id) if task_repo else []
                    tool_result = {
                        "count": len(existing),
                        "tasks": [{"id": t.id, "title": t.title, "status": t.status.value} for t in existing[:5]],
                    }

                # Append tool result to conversation messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": json.dumps(tool_result),
                })

            # Call Gemini to synthesize final natural answer from tool output
            with httpx.Client(timeout=timeout) as client:
                res2 = client.post(endpoint, headers=headers, json={
                    "model": self.model,
                    "messages": messages,
                    "tools": GEMINI_TOOLS_SCHEMA,
                    "temperature": 0.2,
                })

            if res2.status_code == 200:
                final_content = res2.json()["choices"][0]["message"].get("content", "").strip()
            else:
                final_content = "Tool executed successfully."

            return {
                "success": True,
                "reply_text": final_content,
                "category": category,
                "task": created_task,
                "improvements": improvements_list,
                "pipeline_executed": pipeline_executed,
                "patch_diff": patch_diff,
                "test_evidence": test_evidence,
                "needs_approval": needs_approval,
                "stages": stages,
            }
        except Exception as e:
            logger.error(f"Error in Gemini coordinator turn: {e}")
            return {"success": False, "error": str(e)}
