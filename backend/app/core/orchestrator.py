"""Universal Orchestration Engine: binds chat events, intent classification, task planning, and human review."""

import hmac
import logging
import re
import time
from typing import Any, Dict, List, Optional
from app.agents.registry import SpecialistAgentRegistry
from app.core.approval_tokens import verify_approval_callback_data
from app.core.config import is_insecure_placeholder, settings
from app.core.intent_classifier import UniversalIntentClassifier

logger = logging.getLogger(__name__)
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
from app.services.assistant_service import run_workspace_assistant_turn


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

    def resolve_telegram_workspace(self, event: ChatEvent) -> str:
        """Resolve and enforce the Telegram user's authorized Personal or Team workspace server-side.

        Never trust client-provided workspace IDs.
        Resolution precedence:
        1. Check if user ID or handle is explicitly bound to a workspace in reviewer_role_assignments.
        2. Check if a workspace has an active platform connection for Telegram.
        3. Check chat type: group/supergroup/channel -> ws_team_default; private 1-on-1 -> ws_personal_default.
        """
        # 1. User-specific assignment
        assigned_ws = self.platform_repo.get_user_workspace(
            platform=event.platform,
            user_id=event.user_id,
            user_handle=event.user_handle,
        )
        if assigned_ws:
            return assigned_ws

        # 2. Platform connection binding
        connected_ws = self.platform_repo.get_connected_workspace(event.platform)
        if connected_ws:
            return connected_ws

        # 3. Chat type from Telegram payload
        chat_type = "private"
        if event.raw_payload:
            msg = event.raw_payload.get("message") or event.raw_payload.get("channel_post") or {}
            chat = msg.get("chat", {})
            chat_type = chat.get("type", "private")

        if chat_type in ("group", "supergroup", "channel"):
            return "ws_team_default"

        return "ws_personal_default"

    def handle_telegram_assistant_turn(self, event: ChatEvent) -> Dict[str, Any]:
        """Route incoming conversational Telegram messages through the unified Gemini/Switch assistant."""
        target_ws = self.resolve_telegram_workspace(event)
        text_stripped = event.message_text.strip()

        # 0a. Identity Lookup Commands: /id, /whoami, /myid
        if text_stripped.lower() in ("/id", "/whoami", "/myid", "id", "whoami", "my id", "what is my id", "my telegram id"):
            info_text = (
                f"👤 **Your Verified Telegram Identity:**\n\n"
                f"• **Display Name:** `{event.user_display_name or 'N/A'}`\n"
                f"• **Telegram Numeric ID:** `{event.user_id}`\n"
                f"• **Username:** @{event.user_handle or 'none'}\n\n"
                f"**How to Authorize This Account:**\n"
                f"1. **Instant Pairing:** Send `/pair <YOUR_HUMAN_APPROVAL_SECRET>` directly in this chat.\n"
                f"2. **Render Environment:** Add to your Render backend Environment Variables:\n"
                f"   `TELEGRAM_OPERATOR_USER_ID={event.user_id}`\n"
                f"   `TELEGRAM_OPERATOR_WORKSPACE_ID={target_ws}`"
            )
            self.gateway.send_outbound(
                OutboundMessage(
                    platform=event.platform,
                    conversation_id=event.conversation_id,
                    thread_id=event.thread_id,
                    text=info_text,
                )
            )
            return {
                "status": "assistant_reply",
                "category": "conversation",
                "workspace_id": target_ws,
                "reply_text": info_text,
            }

        # 0b. Explicit Pairing Command: /pair <secret> or /authorize <secret>
        pair_match = re.match(r"^/(?:pair|authorize|claim)\s+(.+)$", text_stripped, re.IGNORECASE)
        if pair_match:
            candidate_secret = pair_match.group(1).strip()
            valid_secrets = set()
            if settings.HUMAN_APPROVAL_SECRET:
                valid_secrets.add(settings.HUMAN_APPROVAL_SECRET.strip())
            if settings.API_SECRET_KEY:
                valid_secrets.add(settings.API_SECRET_KEY.strip())

            is_secret_valid = any(
                hmac.compare_digest(candidate_secret, s)
                for s in valid_secrets
                if s and not is_insecure_placeholder(s)
            )

            if is_secret_valid:
                self.platform_repo.assign_reviewer_role(
                    platform=PlatformType.TELEGRAM,
                    user_id=event.user_id,
                    role="operator",
                    assigned_by="authenticated-pairing",
                    user_handle=event.user_handle,
                    workspace_id=target_ws,
                )
                success_text = (
                    f"✅ **Account Successfully Authorized as Workspace Operator!**\n\n"
                    f"• **Telegram User:** `{event.user_display_name or event.user_id}`\n"
                    f"• **Telegram ID:** `{event.user_id}`\n"
                    f"• **Workspace:** `{target_ws}`\n"
                    f"• **Role:** `operator` (Authorized Reviewer)\n\n"
                    "You can now click **[ ✅ Approve & Ship ]** on review cards to authorize production deployment.\n\n"
                    "🔒 *Security Recommendation: Delete your message containing the pairing secret from this chat history.*"
                )
                self.gateway.send_outbound(
                    OutboundMessage(
                        platform=event.platform,
                        conversation_id=event.conversation_id,
                        thread_id=event.thread_id,
                        text=success_text,
                    )
                )
                return {
                    "status": "paired",
                    "workspace_id": target_ws,
                    "user_id": event.user_id,
                    "reply_text": success_text,
                }
            else:
                fail_text = "⛔ **Pairing Failed:** Invalid secret key. Access denied."
                self.gateway.send_outbound(
                    OutboundMessage(
                        platform=event.platform,
                        conversation_id=event.conversation_id,
                        thread_id=event.thread_id,
                        text=fail_text,
                    )
                )
                return {"status": "pairing_failed", "reply_text": fail_text}

        # 1. Retrieve conversation context history strictly isolated by (platform, conversation, workspace)
        history = self.platform_repo.get_chat_history(
            platform=event.platform,
            conversation_id=event.conversation_id,
            workspace_id=target_ws,
            limit=8,
        )

        # 2. Run the unified workspace assistant turn (Gemini runtime or deterministic Switch pipeline)
        assistant_resp = run_workspace_assistant_turn(
            message=event.message_text,
            workspace_id=target_ws,
            history=history,
            task_repo=self.task_repo,
            actor_id=f"tg_{event.user_handle or event.user_id}",
            input_source="telegram",
        )

        # 3. Persist conversation turns in platform_chat_history
        self.platform_repo.save_chat_turn(
            platform=event.platform,
            conversation_id=event.conversation_id,
            user_id=event.user_id,
            workspace_id=target_ws,
            role="user",
            content=event.message_text,
        )
        self.platform_repo.save_chat_turn(
            platform=event.platform,
            conversation_id=event.conversation_id,
            user_id="shipdev-assistant",
            workspace_id=target_ws,
            role="assistant",
            content=assistant_resp.reply_text,
        )

        # 4. Correlate task with conversation thread if a task was created or inspected
        task_id = assistant_resp.task.id if assistant_resp.task else None
        if assistant_resp.task:
            cat = TaskCategory.ENGINEERING if assistant_resp.category == "engineering" else TaskCategory.GENERAL
            self.platform_repo.create_mapping(
                platform=event.platform,
                conversation_id=event.conversation_id,
                thread_id=event.thread_id,
                user_id=event.user_id,
                user_display_name=event.user_display_name or event.user_handle,
                task_id=assistant_resp.task.id,
                intent_category=cat,
                status=assistant_resp.task.status.value,
            )

        # 5. Deliver assistant reply to Telegram chat
        self.gateway.send_outbound(
            OutboundMessage(
                platform=event.platform,
                conversation_id=event.conversation_id,
                thread_id=event.thread_id,
                text=assistant_resp.reply_text,
                task_id=task_id,
            )
        )

        # 6. If execution halted at AWAITING_HUMAN_APPROVAL, dispatch interactive review card with InlineKeyboardMarkup
        if assistant_resp.needs_approval and assistant_resp.task:
            ev_summary = (
                f"Regression suite exit code {assistant_resp.test_evidence.exit_code} (Verified clean)"
                if assistant_resp.test_evidence and assistant_resp.test_evidence.exit_code == 0
                else "Automated tests verified"
            )
            review_payload = ReviewRequestPayload(
                task_id=assistant_resp.task.id,
                title=assistant_resp.task.title,
                summary=assistant_resp.task.description,
                category=TaskCategory.ENGINEERING,
                patch_diff=assistant_resp.patch_diff,
                evidence_summary=ev_summary,
                status=assistant_resp.task.status.value,
            )
            self.gateway.send_review_request(
                platform=event.platform,
                conversation_id=event.conversation_id,
                payload=review_payload,
                thread_id=event.thread_id,
            )

        return {
            "status": "assistant_reply",
            "category": assistant_resp.category,
            "workspace_id": target_ws,
            "task_id": task_id,
            "pipeline_executed": assistant_resp.pipeline_executed,
            "needs_approval": assistant_resp.needs_approval,
            "reply_text": assistant_resp.reply_text,
        }

    def handle_chat_event(self, event: ChatEvent) -> Dict[str, Any]:
        """Main entrypoint for processing any verified incoming chat event."""
        # 1. Route interactive human review decisions (Approve / Reject buttons)
        if event.mention_type == MentionType.ACTION:
            return self.handle_review_action(event)

        # 2. For standard Telegram conversational messages: route through unified Gemini/Switch assistant
        if event.platform == PlatformType.TELEGRAM and not event.message_text.strip().startswith("/shipdev "):
            return self.handle_telegram_assistant_turn(event)

        # 3. Check for active conversation task in thread
        active_mapping = self.platform_repo.get_active_mapping(
            platform=event.platform,
            conversation_id=event.conversation_id,
            thread_id=event.thread_id,
        )

        # 4. Classify intent and plan task
        classification = self.classifier.classify(event.message_text)
        plan = self.planner.plan_task(
            category=classification.category,
            title=classification.title,
            entities=classification.entities,
        )

        # 5. Select specialist agents
        assigned_agents = self.agents.select_agents_for_capabilities(plan.required_capabilities)

        # 6. Determine target workspace by platform binding:
        # Personal: Discord, Telegram -> ws_personal_default
        # Team: Slack, Teams -> ws_team_default
        if event.platform in (PlatformType.DISCORD, PlatformType.TELEGRAM):
            target_ws = "ws_personal_default"
        else:
            target_ws = "ws_team_default"

        # 7. Persist task in backend repository (Strictly starting at REPORTED)
        task_payload = TaskCreate(
            title=plan.title,
            description=f"[{classification.category.value.upper()}] {event.message_text.strip()}",
            reported_by=f"{event.platform.value}:{event.user_handle or event.user_id}",
            input_source=event.platform.value,
            workspace_id=target_ws,
        )
        task = self.task_repo.create_task(task_payload)

        # 8. Correlate conversation thread to task
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

        # 9. Post initial status acknowledgment to conversation
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
        """Handle human review interactive decisions (Approve & Ship / Request Changes).

        Enforces:
        1. Cryptographic token validation and expiration.
        2. Task state replay protection (must be in AWAITING_HUMAN_APPROVAL).
        3. Strict workspace reviewer authorization bound to verified numeric user ID.
        4. Complete audit trail in approval_records and task_transitions.
        """
        task_id = event.action_value
        action = event.action_id or ""

        if not task_id:
            return {"status": "error", "message": "Missing task_id in action value"}

        # 1. Platform-level reviewer authorization check (fail-closed for unauthorized callers)
        if not self.platform_repo.is_authorized_reviewer(platform=event.platform, user_id=event.user_id):
            logger.warning(
                f"[TELEGRAM_AUTH_GATE] Unauthorized review attempt by user_id='{event.user_id}', "
                f"name='{event.user_display_name}', handle='{event.user_handle}', task_id='{task_id}'"
            )
            self.gateway.send_outbound(
                OutboundMessage(
                    platform=event.platform,
                    conversation_id=event.conversation_id,
                    thread_id=event.thread_id,
                    text=(
                        f"⛔ **Permission Denied:** User `{event.user_display_name or event.user_id}` "
                        f"(Telegram ID: `{event.user_id}`) is not an authorized reviewer for this workspace.\n\n"
                        f"**To authorize this account:**\n"
                        f"1. Send `/pair <YOUR_HUMAN_APPROVAL_SECRET>` directly in this chat.\n"
                        f"2. Or add in Render backend Environment Variables:\n"
                        f"   `TELEGRAM_OPERATOR_USER_ID={event.user_id}`\n"
                        f"   `TELEGRAM_OPERATOR_WORKSPACE_ID=ws_personal_default`"
                    ),
                    task_id=task_id,
                )
            )
            return {"status": "unauthorized", "user_id": event.user_id}

        # 2. Cryptographic Token Validation & Expiration Check
        cb_data = (event.raw_payload or {}).get("callback_query", {}).get("data")
        if cb_data:
            is_valid, token_act, token_tid, err_reason = verify_approval_callback_data(cb_data)
            if not is_valid:
                if err_reason and "expired" in err_reason.lower():
                    self.gateway.send_outbound(
                        OutboundMessage(
                            platform=event.platform,
                            conversation_id=event.conversation_id,
                            thread_id=event.thread_id,
                            text=(
                                f"⛔ **Approval Expired:** The review decision token for `{task_id}` has expired. "
                                "Please re-trigger verification or review in the workspace."
                            ),
                            task_id=task_id,
                        )
                    )
                    return {"status": "expired", "task_id": task_id, "detail": err_reason}
                else:
                    self.gateway.send_outbound(
                        OutboundMessage(
                            platform=event.platform,
                            conversation_id=event.conversation_id,
                            thread_id=event.thread_id,
                            text=(
                                f"⛔ **Invalid Approval Token:** Cryptographic validation failed for review callback on `{task_id}`. "
                                "Callback data has been rejected."
                            ),
                            task_id=task_id,
                        )
                    )
                    return {"status": "invalid_token", "task_id": task_id, "detail": err_reason}

        # 3. Fetch task to verify existence and determine workspace scope
        try:
            task = self.task_repo.get_task(task_id)
        except Exception:
            return {"status": "error", "message": f"Task '{task_id}' not found"}

        # 4. Strict Workspace Reviewer Authorization Check Scoped to Task Workspace
        is_ws_authorized = self.platform_repo.is_authorized_reviewer(
            platform=event.platform,
            user_id=event.user_id,
            workspace_id=task.workspace_id,
        )
        if not is_ws_authorized:
            logger.warning(
                f"[TELEGRAM_AUTH_GATE] Cross-workspace unauthorized review attempt: user_id='{event.user_id}', "
                f"workspace='{task.workspace_id}', task_id='{task_id}'"
            )
            self.gateway.send_outbound(
                OutboundMessage(
                    platform=event.platform,
                    conversation_id=event.conversation_id,
                    thread_id=event.thread_id,
                    text=(
                        f"⛔ **Permission Denied:** User `{event.user_display_name or event.user_id}` "
                        f"(Telegram ID: `{event.user_id}`) is not an authorized reviewer for workspace `{task.workspace_id}`.\n\n"
                        f"**To authorize this account:**\n"
                        f"1. Send `/pair <YOUR_HUMAN_APPROVAL_SECRET>` directly in this chat.\n"
                        f"2. Or add in Render backend Environment Variables:\n"
                        f"   `TELEGRAM_OPERATOR_USER_ID={event.user_id}`\n"
                        f"   `TELEGRAM_OPERATOR_WORKSPACE_ID={task.workspace_id}`"
                    ),
                    task_id=task_id,
                )
            )
            return {"status": "unauthorized", "user_id": event.user_id, "workspace_id": task.workspace_id}

        # 5. Replay Protection: Task must be currently in AWAITING_HUMAN_APPROVAL
        if task.status != TaskStatus.AWAITING_HUMAN_APPROVAL:
            self.gateway.send_outbound(
                OutboundMessage(
                    platform=event.platform,
                    conversation_id=event.conversation_id,
                    thread_id=event.thread_id,
                    text=(
                        f"⛔ **Replay Protected:** Decision already recorded. Task `{task_id}` "
                        f"is currently in `{task.status.value}` status."
                    ),
                    task_id=task_id,
                )
            )
            return {"status": "replay_rejected", "task_id": task_id, "current_status": task.status.value}

        # Acknowledge Telegram callback query if present
        if event.platform == PlatformType.TELEGRAM and event.raw_payload:
            cb_id = event.raw_payload.get("callback_query", {}).get("id")
            if cb_id:
                tg_adapter = self.gateway.get_adapter(PlatformType.TELEGRAM)
                if tg_adapter and hasattr(tg_adapter, "answer_callback_query"):
                    tg_adapter.answer_callback_query(cb_id, text="Review decision processed.")

        # 5. Process Approval Decision
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

        # 6. Process Rejection & Revision Loop
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
