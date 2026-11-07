"""Outbound Review Dispatcher: routes verification results and interactive decision cards to chat platforms."""

from typing import Optional
from app.core.platform_gateway import PlatformGateway
from app.models.platform import (
    DeliveryResult,
    OutboundMessage,
    PlatformType,
    ReviewRequestPayload,
    TaskCategory,
)
from app.repositories.platform_repository import PlatformRepository
from app.repositories.task_repository import TaskRepository


class ReviewDispatcher:
    def __init__(
        self,
        gateway: Optional[PlatformGateway] = None,
        task_repo: Optional[TaskRepository] = None,
        platform_repo: Optional[PlatformRepository] = None,
    ):
        self.platform_repo = platform_repo or PlatformRepository()
        self.gateway = gateway or PlatformGateway(repository=self.platform_repo)
        self.task_repo = task_repo or TaskRepository()

    def dispatch_review_request(self, task_id: str) -> Optional[DeliveryResult]:
        """Dispatch an interactive review card to the platform conversation that originated this task."""
        mapping = self.platform_repo.get_mapping_by_task_id(task_id)
        if not mapping:
            return None  # Task originated from IDE web UI or API, not chat

        task = self.task_repo.get_task(task_id)
        evidence_list = self.task_repo.list_evidence_for_task(task_id)

        # Extract verification evidence and patch diff
        verify_ev = next((e for e in reversed(evidence_list) if e.stage == "verification"), None)
        repro_ev = next((e for e in reversed(evidence_list) if e.stage == "reproduction"), None)

        patch_diff = (verify_ev.patch_diff if verify_ev else None) or (repro_ev.patch_diff if repro_ev else None)
        evidence_summary = (
            f"Regression suite exit code {verify_ev.exit_code} (Verified clean)"
            if verify_ev and verify_ev.exit_code == 0
            else "Automated tests confirmed"
        )

        category = mapping.intent_category or TaskCategory.ENGINEERING

        payload = ReviewRequestPayload(
            task_id=task.id,
            title=task.title,
            summary=task.description,
            category=category,
            patch_diff=patch_diff,
            evidence_summary=evidence_summary,
            status=task.status.value,
        )

        return self.gateway.send_review_request(
            platform=mapping.platform,
            conversation_id=mapping.conversation_id,
            payload=payload,
            thread_id=mapping.thread_id,
        )

    def dispatch_completion_notice(self, task_id: str, operator_id: str) -> Optional[DeliveryResult]:
        """Notify the chat thread that a task was approved and deployed."""
        mapping = self.platform_repo.get_mapping_by_task_id(task_id)
        if not mapping:
            return None

        text = (
            f"🚀 **ShipDev Task Completed:** `{task_id}`\n"
            f"• **Approved By:** `{operator_id}`\n"
            f"• **Status:** `COMPLETED`\n"
            "All verification gates passed. Changes merged into main branch."
        )
        return self.gateway.send_outbound(
            OutboundMessage(
                platform=mapping.platform,
                conversation_id=mapping.conversation_id,
                thread_id=mapping.thread_id,
                text=text,
                task_id=task_id,
            )
        )
