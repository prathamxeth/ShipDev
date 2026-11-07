"""Universal Task Planner: synthesizes execution requirements, capability selection, and verification policies."""

from typing import Any, Dict, List
from pydantic import BaseModel, Field
from app.models.platform import TaskCategory


class PlanStage(BaseModel):
    stage_name: str
    description: str
    agent_capability: str
    expected_output: str


class TaskPlan(BaseModel):
    category: TaskCategory
    title: str
    required_capabilities: List[str]
    required_tools: List[str]
    evidence_requirements: List[str]
    approval_policy: str  # "mandatory_human_signoff" | "standard_review"
    execution_stages: List[PlanStage]
    target_files: List[str] = Field(default_factory=list)


# Category execution blueprints
CATEGORY_BLUEPRINTS: Dict[TaskCategory, Dict[str, Any]] = {
    TaskCategory.ENGINEERING: {
        "required_capabilities": ["code_triage", "sandbox_verification", "patch_synthesis"],
        "required_tools": ["pytest", "git", "diff", "isolated_subprocess"],
        "evidence_requirements": [
            "reproduction_exit_code_1",
            "clean_unified_diff",
            "verification_regression_exit_code_0",
        ],
        "approval_policy": "mandatory_human_signoff",
        "stages": [
            PlanStage(
                stage_name="triage_and_reproduction",
                description="Analyze root cause in clean-room sandbox and confirm defect reproduction.",
                agent_capability="code_triage",
                expected_output="reproduction_evidence",
            ),
            PlanStage(
                stage_name="patch_synthesis",
                description="Synthesize minimal targeted code patch resolving defect.",
                agent_capability="patch_synthesis",
                expected_output="unified_diff",
            ),
            PlanStage(
                stage_name="independent_verification",
                description="Apply patch in clean isolated workspace and execute regression tests.",
                agent_capability="sandbox_verification",
                expected_output="verification_evidence",
            ),
        ],
    },
    TaskCategory.RESEARCH: {
        "required_capabilities": ["codebase_research", "information_synthesis"],
        "required_tools": ["code_search", "file_reader", "markdown_compiler"],
        "evidence_requirements": ["codebase_references", "synthesis_artifact"],
        "approval_policy": "standard_review",
        "stages": [
            PlanStage(
                stage_name="investigation",
                description="Explore codebase and reference documentation.",
                agent_capability="codebase_research",
                expected_output="research_findings",
            ),
            PlanStage(
                stage_name="synthesis",
                description="Synthesize structured analysis and technical recommendations.",
                agent_capability="information_synthesis",
                expected_output="research_report",
            ),
        ],
    },
    TaskCategory.PLANNING: {
        "required_capabilities": ["architecture_planning", "task_decomposition"],
        "required_tools": ["dependency_grapher", "markdown_compiler"],
        "evidence_requirements": ["phased_roadmap", "dependency_verification"],
        "approval_policy": "mandatory_human_signoff",
        "stages": [
            PlanStage(
                stage_name="decomposition",
                description="Decompose user request into discrete deliverables and dependencies.",
                agent_capability="task_decomposition",
                expected_output="task_breakdown",
            ),
            PlanStage(
                stage_name="scheduling",
                description="Assemble milestone timeline and execution plan.",
                agent_capability="architecture_planning",
                expected_output="execution_plan",
            ),
        ],
    },
    TaskCategory.WRITING: {
        "required_capabilities": ["documentation_authoring", "api_spec_review"],
        "required_tools": ["markdown_validator", "docstring_inspector"],
        "evidence_requirements": ["formatted_markdown", "documentation_diff"],
        "approval_policy": "standard_review",
        "stages": [
            PlanStage(
                stage_name="drafting",
                description="Draft clear, structured technical documentation.",
                agent_capability="documentation_authoring",
                expected_output="documentation_draft",
            ),
            PlanStage(
                stage_name="audit",
                description="Audit links, parameters, and formatting accuracy.",
                agent_capability="api_spec_review",
                expected_output="reviewed_documentation",
            ),
        ],
    },
    TaskCategory.ANALYSIS: {
        "required_capabilities": ["log_diagnosis", "performance_profiling"],
        "required_tools": ["metric_analyzer", "trace_inspector"],
        "evidence_requirements": ["bottleneck_metrics", "diagnostic_log_evidence"],
        "approval_policy": "mandatory_human_signoff",
        "stages": [
            PlanStage(
                stage_name="metric_collection",
                description="Inspect execution logs and collect bottleneck indicators.",
                agent_capability="log_diagnosis",
                expected_output="diagnostic_evidence",
            ),
            PlanStage(
                stage_name="evaluation",
                description="Formulate concrete optimization or remediation steps.",
                agent_capability="performance_profiling",
                expected_output="analysis_report",
            ),
        ],
    },
}


class UniversalTaskPlanner:
    """Generates rigorous task plans tailored to the classified intent and entities."""

    def plan_task(self, category: TaskCategory, title: str, entities: Dict[str, Any]) -> TaskPlan:
        blueprint = CATEGORY_BLUEPRINTS.get(category, CATEGORY_BLUEPRINTS[TaskCategory.ENGINEERING])

        target_files = entities.get("files", [])

        return TaskPlan(
            category=category,
            title=title,
            required_capabilities=list(blueprint["required_capabilities"]),
            required_tools=list(blueprint["required_tools"]),
            evidence_requirements=list(blueprint["evidence_requirements"]),
            approval_policy=blueprint["approval_policy"],
            execution_stages=list(blueprint["stages"]),
            target_files=target_files,
        )

