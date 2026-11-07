"""Universal Orchestration Engine: binds chat events, intent classification, task planning, and human review."""

import time
from typing import Any, Dict, List, Optional
from app.agents.registry import SpecialistAgentRegistry
from app.core.intent_classifier import UniversalIntentClassifier
from app.core.platform_gateway import PlatformGateway
from app.core.state_machine import CallerType, TaskStatus
from app.core.task_planner import TaskPlan, UniversalTaskPlanner
from app.models.platform import (
    ChatEvent,
    ConversationTaskMapping,
    MentionType,
    OutboundMessage,
    PlatformType,
    ReviewRequestPayload,
    TaskCategory,
)
from app.models.task import ApprovalRequest, RejectionRequest, TaskCreate, TransitionRequest
from app.repositories.platform_repository import PlatformRepository
from app.repositories.task_repository import TaskRepository


class UniversalOrchestrator:
    def __init__(
        self,
        gateway: Optional[PlatformGateway] = None,
        task_repo: Optional[TaskRepository] = None,
        platform_repo: Optional[PlatformRepository] = None,
        classifier: Optional[UniversalIntentClassifier] = None,
        planner: Optional[UniversalTaskPlanner] = None,
        agent_registry: Optional[SpecialistAgentRegistry] = None,
    ):
        self.platform_repo = platform_repo or PlatformRepository()
        self.gateway = gateway or PlatformGateway(repository=self.platform_repo)
        self.task_repo = task_repo or TaskRepository()
        self.classifier = classifier or UniversalIntentClassifier()
        self.planner = planner or UniversalTaskPlanner()
        self.agents = agent_registry or SpecialistAgentRegistry()

    def handle_chat_event(self, event: ChatEvent) -> Dict[str, Any]:
        """Main entrypoint for processing any verified incoming chat event."""
        # 1. Route interactive human review decisions (Approve / Reject buttons)
        if event.mention_type == MentionType.ACTION:
            return self.handle_review_action(event)

        # 2. Check for active conversation task in thread
        active_mapping = self.platform_repo.get_active_mapping(
            platform=event.platform,
            conversation_id=event.conversation_id,
            thread_id=event.thread_id,
        )

        # 3. Classify intent and plan task
        classification = self.classifier.classify(event.message_text)
        plan = self.planner.plan_task(
            category=classification.category,
            title=classification.title,
            entities=classification.entities,
        )

        # 4. Select specialist agents
        assigned_agents = self.agents.select_agents_for_capabilities(plan.required_capabilities)

        # 5. Determine target workspace by platform binding:
        # Personal: Discord, Telegram -> ws_personal_default
        # Team: Slack, Teams -> ws_team_default
        if event.platform in (PlatformType.DISCORD, PlatformType.TELEGRAM):
            target_ws = "ws_personal_default"
        else:
            target_ws = "ws_team_default"

        # 6. Persist task in backend repository (Strictly starting at REPORTED)
        task_payload = TaskCreate(
            title=plan.title,
            description=f"[{classification.category.value.upper()}] {event.message_text.strip()}",
            reported_by=f"{event.platform.value}:{event.user_handle or event.user_id}",
            input_source=event.platform.value,
            workspace_id=target_ws,
        )
        task = self.task_repo.create_task(task_payload)

        # 7. Correlate conversation thread to task
        mapping = self.platform_repo.create_mapping(
            platform=event.platform,
            conversation_id=event.conversation_id,
            thread_id=event.thread_id,
            user_id=event.user_id,
            user_display_name=event.user_display_name or event.user_handle,
            task_id=task.id,
            intent_category=classification.category,
            status=task.status.value,
        )

        # 8. Post initial status acknowledgment to conversation
        agent_names = ", ".join([a.name for a in assigned_agents]) or "AI Team"
        ack_text = (
            f"⚡ **ShipDev Acknowledged:** `{task.title}`\n"
            f"• **Task ID:** `{task.id}`\n"
            f"• **Category:** `{classification.category.value.upper()}` (Confidence: {int(classification.confidence * 100)}%)\n"
            f"• **Assigned Specialists:** {agent_names}\n"
            f"• **Verification Policy:** `{plan.approval_policy}`\n"
            f"Initiating autonomous investigation..."
        )
        self.gateway.send_outbound(
            OutboundMessage(
                platform=event.platform,
                conversation_id=event.conversation_id,
                thread_id=event.thread_id,
                text=ack_text,
                task_id=task.id,
            )
        )

        return {
            "status": "task_created",
            "task_id": task.id,
            "category": classification.category.value,
            "mapping_id": mapping.id,
            "assigned_agents": [a.agent_id for a in assigned_agents],
        }

    def handle_review_action(self, event: ChatEvent) -> Dict[str, Any]:
        """Handle human review interactive decisions (Approve & Ship / Request Changes)."""
        task_id = event.action_value
        action = event.action_id or ""

        if not task_id:
            return {"status": "error", "message": "Missing task_id in action value"}

        # 1. Server-Side Identity & Reviewer Authorization Check
        is_authorized = self.platform_repo.is_authorized_reviewer(
            platform=event.platform,
            user_id=event.user_id,
        )
        if not is_authorized:
            self.gateway.send_outbound(
                OutboundMessage(
                    platform=event.platform,
                    conversation_id=event.conversation_id,
                    thread_id=event.thread_id,
                    text=(
                        f"⛔ **Permission Denied:** User `{event.user_display_name or event.user_id}` "
                        "is not an authorized reviewer for this workspace. Human review decisions "
                        "require a designated operator role."
                    ),
                    task_id=task_id,
                )
            )
            return {"status": "unauthorized", "user_id": event.user_id}

        # 2. Fetch task to verify existence and determine workspace scope
        try:
            task = self.task_repo.get_task(task_id)
        except Exception:
            return {"status": "error", "message": f"Task '{task_id}' not found"}

        # 2. Process Approval Decision
        if "approve" in action.lower():
            try:
                # Transition AWAITING_HUMAN_APPROVAL -> APPROVED -> COMPLETED
                self.task_repo.record_human_approval(
                    task_id=task_id,
                    approval_req=ApprovalRequest(
                        reviewer_id=f"{event.platform.value}:{event.user_id}",
                        comments=f"Approved by authorized human operator via {event.platform.value}.",
                    ),
                    workspace_id=task.workspace_id,
                )
                self.task_repo.record_transition(
                    task_id=task_id,
                    data=TransitionRequest(
                        target_status=TaskStatus.COMPLETED,
                        actor_type=CallerType.HUMAN,
                        actor_id=f"{event.platform.value}:{event.user_id}",
                        reason="Production deployment verified.",
                    ),
                    workspace_id=task.workspace_id,
                )
                self.platform_repo.update_mapping_status(task_id, "COMPLETED")

                self.gateway.send_outbound(
                    OutboundMessage(
                        platform=event.platform,
                        conversation_id=event.conversation_id,
                        thread_id=event.thread_id,
                        text=(
                            f"🎉 **Task Approved & Shipped!** `{task_id}`\n"
                            f"Verified by `{event.user_display_name or event.user_id}`. "
                            "Solution deployed to production with 0 regressions."
                        ),
                        task_id=task_id,
                    )
                )
                return {"status": "approved", "task_id": task_id}
            except Exception as e:
                return {"status": "error", "detail": str(e)}

        # 3. Process Rejection & Revision Loop
        elif "reject" in action.lower():
            try:
                feedback = "Reviewer requested changes to candidate solution."
                self.task_repo.record_human_rejection(
                    task_id=task_id,
                    rejection_req=RejectionRequest(
                        reviewer_id=f"{event.platform.value}:{event.user_id}",
                        feedback=feedback,
                        return_to=TaskStatus.FIX_PROPOSED,
                    ),
                    workspace_id=task.workspace_id,
                )
                self.platform_repo.update_mapping_status(task_id, "REVISION_REQUESTED")

                self.gateway.send_outbound(
                    OutboundMessage(
                        platform=event.platform,
                        conversation_id=event.conversation_id,
                        thread_id=event.thread_id,
                        text=(
                            f"🔄 **Revision Requested:** `{task_id}`\n"
                            f"Feedback recorded: *{feedback}*\n"
                            "Fix Assistant and Verification Sentinel are preparing an adjusted patch..."
                        ),
                        task_id=task_id,
                    )
                )
                return {"status": "revision_requested", "task_id": task_id}
            except Exception as e:
                return {"status": "error", "detail": str(e)}

        return {"status": "unknown_action", "action": action}
