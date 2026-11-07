"""Telegram Platform Adapter: secret token checks, InlineKeyboards, and Bot API delivery."""

import hmac
import json
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


class TelegramAdapter(BasePlatformAdapter):
    def __init__(
        self,
        bot_token: Optional[str] = None,
        webhook_secret: Optional[str] = None,
    ):
        super().__init__(PlatformType.TELEGRAM)
        self.bot_token = bot_token or settings.TELEGRAM_BOT_TOKEN
        self.webhook_secret = webhook_secret or settings.TELEGRAM_WEBHOOK_SECRET

    def verify_signature(self, headers: Dict[str, str], body_bytes: bytes) -> bool:
        """Verify Telegram webhook secret token header (fail-closed)."""
        if not self.webhook_secret:
            return False

        normalized = {k.lower(): v for k, v in headers.items()}
        secret_header = normalized.get("x-telegram-bot-api-secret-token", "")
        return hmac.compare_digest(secret_header, self.webhook_secret)

    def parse_webhook(self, headers: Dict[str, str], body_bytes: bytes) -> Optional[ChatEvent]:
        """Parse Telegram Update JSON payload."""
        try:
            data = json.loads(body_bytes.decode("utf-8"))
        except Exception:
            return None

        update_id = str(data.get("update_id", "tg_upd"))

        # 1. Handle Inline Keyboard Button Click (callback_query)
        if "callback_query" in data:
            cb = data["callback_query"]
            cb_id = str(cb.get("id", update_id))
            from_user = cb.get("from", {})
            cb_message = cb.get("message", {})
            chat = cb_message.get("chat", {})
            cb_data = cb.get("data", "")

            action_id = "unknown_action"
            action_value = None
            if ":" in cb_data:
                parts = cb_data.split(":", 1)
                action_id = f"{parts[0]}_task"
                action_value = parts[1]

            return ChatEvent(
                event_id=f"cb_{cb_id}",
                platform=PlatformType.TELEGRAM,
                conversation_id=str(chat.get("id", "")),
                thread_id=str(cb_message.get("message_thread_id")) if cb_message.get("message_thread_id") else None,
                user_id=str(from_user.get("id", "")),
                user_display_name=from_user.get("first_name", "") + (" " + from_user.get("last_name", "") if from_user.get("last_name") else ""),
                user_handle=from_user.get("username"),
                message_text=f"Button click: {cb_data}",
                mention_type=MentionType.ACTION,
                action_id=action_id,
                action_value=action_value,
                raw_payload=data,
            )

        # 2. Standard Message or Channel Post
        message = data.get("message") or data.get("channel_post", {})
        if not message:
            return None

        chat = message.get("chat", {})
        from_user = message.get("from", {})
        text = message.get("text", "")
        msg_id = str(message.get("message_id", update_id))

        return ChatEvent(
            event_id=f"msg_{msg_id}",
            platform=PlatformType.TELEGRAM,
            conversation_id=str(chat.get("id", "")),
            thread_id=str(message.get("message_thread_id")) if message.get("message_thread_id") else None,
            user_id=str(from_user.get("id", "")),
            user_display_name=from_user.get("first_name", "") + (" " + from_user.get("last_name", "") if from_user.get("last_name") else ""),
            user_handle=from_user.get("username"),
            message_text=text,
            mention_type=MentionType.DIRECT_MESSAGE if chat.get("type") == "private" else MentionType.MENTION,
            raw_payload=data,
        )

    def format_message(self, message: OutboundMessage) -> Dict[str, Any]:
        """Convert OutboundMessage into Telegram Bot API sendMessage format."""
        payload: Dict[str, Any] = {
            "chat_id": message.conversation_id,
            "text": message.text,
            "parse_mode": "HTML",
        }
        if message.thread_id:
            payload["message_thread_id"] = int(message.thread_id)
        return payload

    def send_message(self, message: OutboundMessage) -> DeliveryResult:
        """Transmit message via Telegram Bot API."""
        if not self.bot_token:
            return DeliveryResult(
                success=False,
                platform=PlatformType.TELEGRAM,
                error="TELEGRAM_BOT_TOKEN is not configured on ShipDev backend.",
            )

        payload = self.format_message(message)
        req_data = json.dumps(payload).encode("utf-8")
        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        req = urllib.request.Request(url, data=req_data, headers={"Content-Type": "application/json"}, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("ok"):
                    msg_id = str(data.get("result", {}).get("message_id", "tg_sent"))
                    return DeliveryResult(success=True, platform=PlatformType.TELEGRAM, message_id=msg_id)
                return DeliveryResult(success=False, platform=PlatformType.TELEGRAM, error=str(data.get("description")))
        except Exception as e:
            return DeliveryResult(
                success=False,
                platform=PlatformType.TELEGRAM,
                error=f"Telegram delivery error: {str(e)}",
            )

    def send_review_card(
        self, conversation_id: str, payload: ReviewRequestPayload, thread_id: Optional[str] = None
    ) -> DeliveryResult:
        """Render and send an interactive Telegram review card with InlineKeyboardMarkup."""
        card_text = (
            f"🚨 <b>Human Review Required: {payload.title}</b>\n\n"
            f"<b>Task ID:</b> <code>{payload.task_id}</code>\n"
            f"<b>Category:</b> <code>{payload.category.value.upper()}</code>\n"
            f"<b>Status:</b> <code>{payload.status}</code>\n"
            f"<b>Evidence:</b> {payload.evidence_summary}\n\n"
            f"<b>Summary of Solution:</b>\n{payload.summary}\n"
        )

        if payload.patch_diff:
            diff_snippet = payload.patch_diff[:800]
            card_text += f"\n<pre><code class=\"language-diff\">{diff_snippet}</code></pre>\n"

        inline_keyboard = [
            [
                {
                    "text": "✅ Approve & Ship",
                    "callback_data": f"approve:{payload.task_id}",
                },
                {
                    "text": "❌ Request Changes",
                    "callback_data": f"reject:{payload.task_id}",
                },
            ]
        ]

        if not self.bot_token:
            return DeliveryResult(
                success=False,
                platform=PlatformType.TELEGRAM,
                error="TELEGRAM_BOT_TOKEN is not configured on ShipDev backend.",
            )

        post_body = {
            "chat_id": conversation_id,
            "text": card_text,
            "parse_mode": "HTML",
            "reply_markup": {"inline_keyboard": inline_keyboard},
        }
        if thread_id:
            try:
                post_body["message_thread_id"] = int(thread_id)
            except ValueError:
                pass

        req_data = json.dumps(post_body).encode("utf-8")
        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        req = urllib.request.Request(url, data=req_data, headers={"Content-Type": "application/json"}, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("ok"):
                    return DeliveryResult(
                        success=True,
                        platform=PlatformType.TELEGRAM,
                        message_id=str(data.get("result", {}).get("message_id")),
                    )
                return DeliveryResult(success=False, platform=PlatformType.TELEGRAM, error=str(data.get("description")))
        except Exception as e:
            return DeliveryResult(
                success=False,
                platform=PlatformType.TELEGRAM,
                error=f"Failed sending Telegram review card: {str(e)}",
            )

    def is_configured(self) -> bool:
        return bool(self.bot_token)

    def get_health(self) -> PlatformHealth:
        return PlatformHealth(
            platform=PlatformType.TELEGRAM,
            configured=self.is_configured(),
            status="healthy" if self.is_configured() else "unconfigured",
            details={
                "has_bot_token": bool(self.bot_token),
                "has_webhook_secret": bool(self.webhook_secret),
            },
        )
