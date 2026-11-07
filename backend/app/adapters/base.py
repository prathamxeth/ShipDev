"""Abstract Base Adapter for external chat platform integrations."""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from app.models.platform import (
    ChatEvent,
    DeliveryResult,
    OutboundMessage,
    PlatformHealth,
    PlatformType,
    ReviewRequestPayload,
)


class BasePlatformAdapter(ABC):
    """Abstract base class that all chat platform adapters must implement."""

    def __init__(self, platform_type: PlatformType):
        self.platform_type = platform_type

    @abstractmethod
    def verify_signature(self, headers: Dict[str, str], body_bytes: bytes) -> bool:
        """Cryptographically verify inbound webhook signature (fail-closed)."""
        pass

    @abstractmethod
    def parse_webhook(self, headers: Dict[str, str], body_bytes: bytes) -> Optional[ChatEvent]:
        """Parse raw incoming HTTP payload into canonical ChatEvent."""
        pass

    @abstractmethod
    def format_message(self, message: OutboundMessage) -> Dict[str, Any]:
        """Convert canonical OutboundMessage into platform-native schema (e.g. Block Kit, Adaptive Cards)."""
        pass

    @abstractmethod
    def send_message(self, message: OutboundMessage) -> DeliveryResult:
        """Transmit outbound message to the target platform channel/thread."""
        pass

    @abstractmethod
    def send_review_card(
        self, conversation_id: str, payload: ReviewRequestPayload, thread_id: Optional[str] = None
    ) -> DeliveryResult:
        """Render and send an interactive human review & decision card."""
        pass

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if credentials and webhook secrets are configured."""
        pass

    @abstractmethod
    def get_health(self) -> PlatformHealth:
        """Return health status and configuration details for this adapter."""
        pass

