"""Slack Platform Adapter: signature verification, Block Kit rendering, and review actions."""

import hashlib
import hmac
import json
import time
import urllib.parse
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


class SlackAdapter(BasePlatformAdapter):
    def __init__(
        self,
        bot_token: Optional[str] = None,
        signing_secret: Optional[str] = None,
    ):
        super().__init__(PlatformType.SLACK)
        self.bot_token = bot_token or settings.SLACK_BOT_TOKEN
        self.signing_secret = signing_secret or settings.SLACK_SIGNING_SECRET

    def verify_signature(self, headers: Dict[str, str], body_bytes: bytes) -> bool:
        """Verify Slack HMAC-SHA256 signature using X-Slack-Signature and timestamp."""
        if not self.signing_secret:
            return False

        # Case-insensitive header lookup
        normalized_headers = {k.lower(): v for k, v in headers.items()}
        signature = normalized_headers.get("x-slack-signature")
        timestamp_str = normalized_headers.get("x-slack-request-timestamp")

        if not signature or not timestamp_str:
            return False

        try:
            req_time = int(timestamp_str)
            if abs(time.time() - req_time) > 300:  # Replay attack prevention: > 5 minutes
                return False
        except ValueError:
            return False

        sig_basestring = f"v0:{timestamp_str}:".encode("utf-8") + body_bytes
        computed_sig = "v0=" + hmac.new(
            self.signing_secret.encode("utf-8"),
            sig_basestring,
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(computed_sig, signature)

    def parse_webhook(self, headers: Dict[str, str], body_bytes: bytes) -> Optional[ChatEvent]:
        """Parse Slack event callbacks, url_verification challenges, and interactive block actions."""
        try:
            body_str = body_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return None

        data: Dict[str, Any] = {}
        # Handle URL-encoded payloads (Slack interactive buttons send payload=json_str)
        if body_str.startswith("payload="):
            parsed_form = urllib.parse.parse_qs(body_str)
            raw_json = parsed_form.get("payload", ["{}"])[0]
            try:
                data = json.loads(raw_json)
            except Exception:
                return None
        else:
            try:
                data = json.loads(body_str)
            except Exception:
                return None

        # 1. URL Verification Challenge
        if data.get("type") == "url_verification":
            return ChatEvent(
                event_id=f"challenge_{data.get('challenge', '')}",
                platform=PlatformType.SLACK,
                conversation_id="system",
                user_id="slack_system",
                message_text=data.get("challenge", ""),
                mention_type=MentionType.COMMAND,
                action_id="url_verification",
                action_value=data.get("challenge", ""),
                raw_payload=data,
            )

        # 2. Interactive Block Actions (e.g. Approve & Ship / Request Changes buttons)
        if data.get("type") == "block_actions":
            actions = data.get("actions", [])
            action = actions[0] if actions else {}
            user = data.get("user", {})
            channel = data.get("channel", {})
            container = data.get("container", {})

            return ChatEvent(
                event_id=f"act_{data.get('trigger_id') or action.get('action_id')}_{time.time()}",
                platform=PlatformType.SLACK,
                conversation_id=channel.get("id", ""),
                thread_id=container.get("thread_ts") or container.get("message_ts"),
                user_id=user.get("id", ""),
                user_display_name=user.get("name") or user.get("username"),
                message_text=f"Action: {action.get('action_id')}",
                mention_type=MentionType.ACTION,
                action_id=action.get("action_id"),
                action_value=action.get("value"),
                raw_payload=data,
            )

        # 3. Standard Event Callbacks (app_mention, message)
        if data.get("type") == "event_callback":
            event = data.get("event", {})
            # Ignore bot messages to avoid loops
            if event.get("bot_id") or event.get("subtype") == "bot_message":
                return None

            text = event.get("text", "")
            return ChatEvent(
                event_id=data.get("event_id") or event.get("client_msg_id") or f"slack_{time.time()}",
                platform=PlatformType.SLACK,
                conversation_id=event.get("channel", ""),
                thread_id=event.get("thread_ts") or event.get("ts"),
                user_id=event.get("user", ""),
                user_display_name=None,
                message_text=text,
                mention_type=MentionType.MENTION if "app_mention" in data.get("type", "") else MentionType.DIRECT_MESSAGE,
                raw_payload=data,
            )

        return None

    def format_message(self, message: OutboundMessage) -> Dict[str, Any]:
        """Convert OutboundMessage into Slack Block Kit schema."""
        blocks = message.blocks or [
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": message.text},
            }
        ]

        payload: Dict[str, Any] = {
            "channel": message.conversation_id,
            "text": message.text,
            "blocks": blocks,
        }
        if message.thread_id:
            payload["thread_ts"] = message.thread_id
        return payload

    def send_message(self, message: OutboundMessage) -> DeliveryResult:
        """Transmit message to Slack Web API."""
        if not self.bot_token:
            return DeliveryResult(
                success=False,
                platform=PlatformType.SLACK,
                error="SLACK_BOT_TOKEN is not configured on ShipDev backend.",
            )

        payload = self.format_message(message)
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            "https://slack.com/api/chat.postMessage",
            data=req_data,
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "Authorization": f"Bearer {self.bot_token}",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                resp_body = json.loads(resp.read().decode("utf-8"))
                if resp_body.get("ok"):
                    return DeliveryResult(
                        success=True,
                        platform=PlatformType.SLACK,
                        message_id=resp_body.get("ts"),
                    )
                return DeliveryResult(
                    success=False,
                    platform=PlatformType.SLACK,
                    error=f"Slack API error: {resp_body.get('error', 'unknown')}",
                )
        except Exception as e:
            return DeliveryResult(
                success=False,
                platform=PlatformType.SLACK,
                error=f"Network delivery error: {str(e)}",
            )

    def send_review_card(
        self, conversation_id: str, payload: ReviewRequestPayload, thread_id: Optional[str] = None
    ) -> DeliveryResult:
        """Render and send an interactive Slack Block Kit review card."""
        blocks = [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": f"🚨 Human Review Required: {payload.title}"},
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Task ID:*\n`{payload.task_id}`"},
                    {"type": "mrkdwn", "text": f"*Category:*\n`{payload.category.value.upper()}`"},
                    {"type": "mrkdwn", "text": f"*Status:*\n`{payload.status}`"},
                    {"type": "mrkdwn", "text": f"*Evidence:*\n{payload.evidence_summary}"},
                ],
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Summary of Solution:*\n{payload.summary}"},
            },
        ]

        if payload.patch_diff:
            diff_snippet = payload.patch_diff[:1500]
            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Proposed Diff:*\n```{diff_snippet}```"},
            })

        # Interactive Decision Action Buttons
        blocks.append({
            "type": "actions",
            "block_id": f"review_block_{payload.task_id}",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "✅ Approve & Ship"},
                    "style": "primary",
                    "action_id": "approve_task",
                    "value": payload.task_id,
                },
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "❌ Request Changes"},
                    "style": "danger",
                    "action_id": "reject_task",
                    "value": payload.task_id,
                },
            ],
        })

        outbound = OutboundMessage(
            platform=PlatformType.SLACK,
            conversation_id=conversation_id,
            thread_id=thread_id,
            text=f"Review Required for {payload.title}",
            blocks=blocks,
            task_id=payload.task_id,
        )
        return self.send_message(outbound)

    def is_configured(self) -> bool:
        return bool(self.bot_token and self.signing_secret)

    def get_health(self) -> PlatformHealth:
        return PlatformHealth(
            platform=PlatformType.SLACK,
            configured=self.is_configured(),
            status="healthy" if self.is_configured() else "unconfigured",
            details={
                "has_bot_token": bool(self.bot_token),
                "has_signing_secret": bool(self.signing_secret),
            },
        )

