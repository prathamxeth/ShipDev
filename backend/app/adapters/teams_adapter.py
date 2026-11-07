"""Microsoft Teams Platform Adapter: Adaptive Cards, HMAC/Bearer verification, and review workflows."""

import hashlib
import hmac
import json
import re
import urllib.request
from typing import Any, Dict, Optional
from app.adapters.base import BasePlatformAdapter
from app.core.config import settings
from app.models.platform import (
    ChatEvent,
    DeliveryResult,
    MentionType,
    OutboundMessage,
    PlatformHealth,
    PlatformType,
    ReviewRequestPayload,
)


class TeamsAdapter(BasePlatformAdapter):
    def __init__(
        self,
        app_id: Optional[str] = None,
        app_password: Optional[str] = None,
        webhook_secret: Optional[str] = None,
        incoming_webhook_url: Optional[str] = None,
    ):
        super().__init__(PlatformType.TEAMS)
        self.app_id = app_id or settings.TEAMS_APP_ID
        self.app_password = app_password or settings.TEAMS_APP_PASSWORD
        self.webhook_secret = webhook_secret or settings.TEAMS_WEBHOOK_SECRET
        self.incoming_webhook_url = incoming_webhook_url or settings.TEAMS_INCOMING_WEBHOOK_URL

    def verify_signature(self, headers: Dict[str, str], body_bytes: bytes) -> bool:
        """Verify Microsoft Teams webhook signature using Authorization header or HMAC secret."""
        if not self.webhook_secret:
            return False

        normalized = {k.lower(): v for k, v in headers.items()}
        auth_header = normalized.get("authorization", "")

        # 1. Bearer Token Authentication
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            return hmac.compare_digest(token, self.webhook_secret)

        # 2. HMAC-SHA256 Signature Authentication
        if auth_header.startswith("HMAC "):
            received_sig = auth_header[5:].strip()
            expected_sig = hmac.new(
                self.webhook_secret.encode("utf-8"),
                body_bytes,
                hashlib.sha256,
            ).hexdigest()
            return hmac.compare_digest(expected_sig, received_sig)

        return False

    def parse_webhook(self, headers: Dict[str, str], body_bytes: bytes) -> Optional[ChatEvent]:
        """Parse Microsoft Teams Bot Framework / Webhook activity payload."""
        try:
            data = json.loads(body_bytes.decode("utf-8"))
        except Exception:
            return None

        activity_type = data.get("type", "message")
        event_id = data.get("id") or f"teams_{data.get('timestamp') or id(data)}"
        conversation = data.get("conversation", {})
        from_user = data.get("from", {})

        # 1. Handle Adaptive Card Interactive Action Submits (Approve / Reject)
        action_data = data.get("value")
        if action_data and isinstance(action_data, dict) and "action" in action_data:
            return ChatEvent(
                event_id=event_id,
                platform=PlatformType.TEAMS,
                conversation_id=conversation.get("id", ""),
                thread_id=data.get("replyToId"),
                user_id=from_user.get("id", ""),
                user_display_name=from_user.get("name"),
                message_text=f"Action: {action_data.get('action')}",
                mention_type=MentionType.ACTION,
                action_id=action_data.get("action"),
                action_value=action_data.get("task_id"),
                raw_payload=data,
            )

        # 2. Standard Message Activity
        raw_text = data.get("text", "")
        # Strip XML mention tags like <at>ShipDev</at>
        cleaned_text = re.sub(r"<at[^>]*>.*?</at>", "", raw_text, flags=re.IGNORECASE).strip()

        return ChatEvent(
            event_id=event_id,
            platform=PlatformType.TEAMS,
            conversation_id=conversation.get("id", ""),
            thread_id=data.get("replyToId"),
            user_id=from_user.get("id", ""),
            user_display_name=from_user.get("name"),
            message_text=cleaned_text,
            mention_type=MentionType.MENTION if "<at>" in raw_text else MentionType.DIRECT_MESSAGE,
            raw_payload=data,
        )

    def format_message(self, message: OutboundMessage) -> Dict[str, Any]:
        """Convert OutboundMessage into Microsoft Teams Adaptive Card format."""
        adaptive_body: list = [
            {
                "type": "TextBlock",
                "text": message.text,
                "wrap": True,
            }
        ]

        card = {
            "type": "message",
            "attachments": [
                {
                    "contentType": "application/vnd.microsoft.card.adaptive",
                    "content": {
                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                        "type": "AdaptiveCard",
                        "version": "1.4",
                        "body": adaptive_body,
                    },
                }
            ],
        }
        return card

    def send_message(self, message: OutboundMessage) -> DeliveryResult:
        """Transmit message to Microsoft Teams channel or webhook."""
        if not self.incoming_webhook_url:
            return DeliveryResult(
                success=False,
                platform=PlatformType.TEAMS,
                error="TEAMS_INCOMING_WEBHOOK_URL is not configured on ShipDev backend.",
            )

        payload = self.format_message(message)
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            self.incoming_webhook_url,
            data=req_data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                if resp.status in (200, 202, 204):
                    return DeliveryResult(
                        success=True,
                        platform=PlatformType.TEAMS,
                        message_id=str(resp.headers.get("x-ms-request-id") or "teams_ok"),
                    )
                return DeliveryResult(
                    success=False,
                    platform=PlatformType.TEAMS,
                    error=f"Teams HTTP {resp.status}",
                )
        except Exception as e:
            return DeliveryResult(
                success=False,
                platform=PlatformType.TEAMS,
                error=f"Teams network delivery error: {str(e)}",
            )

    def send_review_card(
        self, conversation_id: str, payload: ReviewRequestPayload, thread_id: Optional[str] = None
    ) -> DeliveryResult:
        """Render and send an interactive Microsoft Teams Adaptive Card review card."""
        adaptive_body: list = [
            {
                "type": "TextBlock",
                "text": f"🚨 Human Review Required: {payload.title}",
                "weight": "Bolder",
                "size": "Medium",
                "color": "Warning",
            },
            {
                "type": "FactSet",
                "facts": [
                    {"title": "Task ID", "value": payload.task_id},
                    {"title": "Category", "value": payload.category.value.upper()},
                    {"title": "Status", "value": payload.status},
                    {"title": "Evidence", "value": payload.evidence_summary},
                ],
            },
            {
                "type": "TextBlock",
                "text": f"**Summary of Solution:**\n{payload.summary}",
                "wrap": True,
            },
        ]

        if payload.patch_diff:
            diff_snippet = payload.patch_diff[:1500]
            adaptive_body.append({
                "type": "TextBlock",
                "text": f"```diff\n{diff_snippet}\n```",
                "fontType": "Monospace",
                "wrap": True,
            })

        adaptive_actions: list = [
            {
                "type": "Action.Submit",
                "title": "✅ Approve & Ship",
                "style": "positive",
                "data": {
                    "action": "approve_task",
                    "task_id": payload.task_id,
                },
            },
            {
                "type": "Action.Submit",
                "title": "❌ Request Changes",
                "style": "destructive",
                "data": {
                    "action": "reject_task",
                    "task_id": payload.task_id,
                },
            },
        ]

        card_payload = {
            "type": "message",
            "attachments": [
                {
                    "contentType": "application/vnd.microsoft.card.adaptive",
                    "content": {
                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                        "type": "AdaptiveCard",
                        "version": "1.4",
                        "body": adaptive_body,
                        "actions": adaptive_actions,
                    },
                }
            ],
        }

        if not self.incoming_webhook_url:
            return DeliveryResult(
                success=False,
                platform=PlatformType.TEAMS,
                error="TEAMS_INCOMING_WEBHOOK_URL is not configured.",
            )

        req_data = json.dumps(card_payload).encode("utf-8")
        req = urllib.request.Request(
            self.incoming_webhook_url,
            data=req_data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                return DeliveryResult(
                    success=resp.status in (200, 202, 204),
                    platform=PlatformType.TEAMS,
                    message_id="teams_review_sent",
                )
        except Exception as e:
            return DeliveryResult(
                success=False,
                platform=PlatformType.TEAMS,
                error=f"Failed sending Teams review card: {str(e)}",
            )

    def is_configured(self) -> bool:
        return bool(self.webhook_secret or self.incoming_webhook_url or (self.app_id and self.app_password))

    def get_health(self) -> PlatformHealth:
        return PlatformHealth(
            platform=PlatformType.TEAMS,
            configured=self.is_configured(),
            status="healthy" if self.is_configured() else "unconfigured",
            details={
                "has_webhook_secret": bool(self.webhook_secret),
                "has_incoming_webhook_url": bool(self.incoming_webhook_url),
                "has_app_credentials": bool(self.app_id and self.app_password),
            },
        )

