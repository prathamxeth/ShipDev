"""Specialist Agent Registry: capability mapping and Switch agent resolution."""

from typing import Dict, List, Optional, Set
from pydantic import BaseModel, Field


class AgentProfile(BaseModel):
    agent_id: str
    name: str
    switch_uuid: str
    role: str
    capabilities: Set[str]
    instructions_file: Optional[str] = None
    is_active: bool = True


DEFAULT_SPECIALIST_AGENTS: List[AgentProfile] = [
    AgentProfile(
        agent_id="shipdev-triager",
        name="Diagnosis Assistant",
        switch_uuid="bd717264-f0ac-4651-a4da-3746ec71fa28",
        role="Bug Triage & Reproduction Sentinel",
        capabilities={"code_triage", "root_cause_analysis", "patch_synthesis", "log_diagnosis"},
        instructions_file="switch/instructions/triager.md",
    ),
    AgentProfile(
        agent_id="shipdev-verifier",
        name="Quality Reviewer",
        switch_uuid="7dc5d295-a3c3-4168-a233-2dc9514b6ca9",
        role="Independent Regression Verification Oracle",
        capabilities={"sandbox_verification", "test_oracle", "regression_testing", "api_spec_review"},
        instructions_file="switch/instructions/verifier.md",
    ),
    AgentProfile(
        agent_id="shipdev-researcher",
        name="Research Specialist",
        switch_uuid="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        role="Codebase Investigation & Survey Agent",
        capabilities={"codebase_research", "information_synthesis"},
        instructions_file="switch/instructions/researcher.md",
    ),
    AgentProfile(
        agent_id="shipdev-planner",
        name="Coordination Planner",
        switch_uuid="b2c3d4e5-f6a7-8901-bcde-f12345678901",
        role="Architecture Decomposition & Sprint Planner",
        capabilities={"architecture_planning", "task_decomposition"},
        instructions_file="switch/instructions/planner.md",
    ),
    AgentProfile(
        agent_id="shipdev-writer",
        name="Documentation Specialist",
        switch_uuid="c3d4e5f6-a7b8-9012-cdef-123456789012",
        role="Technical Author & Release Note Writer",
        capabilities={"documentation_authoring", "api_spec_review"},
        instructions_file="switch/instructions/writer.md",
    ),
]


class SpecialistAgentRegistry:
    """Registry maintaining active specialist agents and dynamic capability selection."""

    def __init__(self, initial_agents: Optional[List[AgentProfile]] = None):
        self._agents: Dict[str, AgentProfile] = {}
        for agent in initial_agents or DEFAULT_SPECIALIST_AGENTS:
            self._agents[agent.agent_id] = agent

    def register_agent(self, profile: AgentProfile) -> None:
        self._agents[profile.agent_id] = profile

    def get_agent(self, agent_id: str) -> Optional[AgentProfile]:
        return self._agents.get(agent_id)

    def list_agents(self) -> List[AgentProfile]:
        return list(self._agents.values())

    def select_agents_for_capabilities(self, capabilities: List[str]) -> List[AgentProfile]:
        """Select minimal set of active agents covering the requested capabilities."""
        needed = set(capabilities)
        selected: List[AgentProfile] = []

        for agent in self._agents.values():
            if not agent.is_active:
                continue
            intersection = agent.capabilities.intersection(needed)
            if intersection:
                selected.append(agent)
                needed -= intersection
                if not needed:
                    break

        return selected

