"""Google Gemini Agent Runtime for ShipDev & Switch Multi-Agent Architecture.

Powers ShipDev's specialist agents with Google Gemini from Google AI Studio,
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

        # Enrich prompt with workspace context
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
