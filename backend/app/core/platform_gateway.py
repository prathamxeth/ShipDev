"""Universal Platform Integration Gateway: inbound routing, deduplication, and outbound dispatch."""

from typing import Dict, List, Optional
from app.adapters.base import BasePlatformAdapter
from app.models.platform import (
    ChatEvent,
    DeliveryResult,
    OutboundMessage,
    PlatformHealth,
    PlatformType,
    ReviewRequestPayload,
)
from app.repositories.platform_repository import PlatformRepository


class PlatformSecurityError(Exception):
    """Raised when webhook signature verification fails."""
    pass


class PlatformGateway:
    def __init__(self, repository: Optional[PlatformRepository] = None):
        self.adapters: Dict[PlatformType, BasePlatformAdapter] = {}
        self.repo = repository or PlatformRepository()

    def register_adapter(self, adapter: BasePlatformAdapter) -> None:
        """Register a platform adapter (e.g. Slack, Teams, Discord, Telegram)."""
        self.adapters[adapter.platform_type] = adapter

    def get_adapter(self, platform: PlatformType) -> Optional[BasePlatformAdapter]:
        """Fetch the adapter registered for a platform."""
        return self.adapters.get(platform)

    def process_inbound_webhook(
        self, platform: PlatformType, headers: Dict[str, str], body_bytes: bytes
    ) -> Optional[ChatEvent]:
        """Verify, deduplicate, and parse an inbound webhook event."""
        adapter = self.get_adapter(platform)
        if not adapter:
            raise ValueError(f"Platform adapter for '{platform.value}' is not registered.")

        # 1. Cryptographic Signature Verification (Fail-closed)
        if not adapter.verify_signature(headers, body_bytes):
            raise PlatformSecurityError(f"Signature verification failed for {platform.value} webhook.")

        # 2. Parse into canonical ChatEvent
        event = adapter.parse_webhook(headers, body_bytes)
        if not event:
            return None

        # 3. Deduplication Check
        if self.repo.is_event_processed(event.event_id):
            return None  # Event already processed; avoid replay or duplicate execution

        # 4. Mark as processed
        self.repo.mark_event_processed(event.event_id, platform)
        return event

    def send_outbound(self, message: OutboundMessage) -> DeliveryResult:
        """Dispatch an outbound message via the target platform adapter."""
        adapter = self.get_adapter(message.platform)
        if not adapter:
            return DeliveryResult(
                success=False,
                platform=message.platform,
                error=f"Platform adapter for '{message.platform.value}' is not registered.",
            )
        return adapter.send_message(message)

    def send_review_request(
        self,
        platform: PlatformType,
        conversation_id: str,
        payload: ReviewRequestPayload,
        thread_id: Optional[str] = None,
    ) -> DeliveryResult:
        """Dispatch a human review card directly into the originating conversation."""
        adapter = self.get_adapter(platform)
        if not adapter:
            return DeliveryResult(
                success=False,
                platform=platform,
                error=f"Platform adapter for '{platform.value}' is not registered.",
            )
        return adapter.send_review_card(conversation_id, payload, thread_id)

    def get_all_health(self) -> List[PlatformHealth]:
        """Return connectivity and configuration health for all supported platforms."""
        results: List[PlatformHealth] = []
        for p in PlatformType:
            adapter = self.adapters.get(p)
            if adapter:
                results.append(adapter.get_health())
            else:
                results.append(
                    PlatformHealth(
                        platform=p,
                        configured=False,
                        status="unconfigured",
                        details={"message": "Adapter not registered in gateway"},
                    )
                )
        return results
