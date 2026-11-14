"""Telegram Platform Adapter: secret token checks, InlineKeyboards, and Bot API delivery."""

import html
import hmac
import json
import re
import urllib.error
import urllib.request
import uuid
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
        self._cached_bot_identity: Optional[Dict[str, Any]] = None

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

        update_id = data.get("update_id")

        # 1. Handle Inline Keyboard Button Click (callback_query)
        if "callback_query" in data:
            cb = data["callback_query"]
            cb_id = str(cb.get("id", "cb"))
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

            if update_id is not None:
                event_id = f"tg_cb_{update_id}_{cb_id}"
            else:
                event_id = f"tg_cb_{cb_id}"

            return ChatEvent(
                event_id=event_id,
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
        msg_id = message.get("message_id")

        if update_id is not None:
            event_id = f"tg_upd_{update_id}"
        elif msg_id is not None:
            event_id = f"tg_msg_{msg_id}"
        else:
            event_id = f"tg_evt_{uuid.uuid4().hex[:12]}"

        return ChatEvent(
            event_id=event_id,
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

    @staticmethod
    def _to_telegram_html(text: str) -> str:
        """Convert markdown text safely to Telegram HTML format."""
        if not text:
            return ""

        # If text already contains Telegram HTML tags, return as is
        if any(tag in text for tag in ("<b>", "<code>", "<pre>", "<i>")):
            return text

        # Escape raw HTML special characters
        escaped = html.escape(text)

        # Code blocks: ```language ... ``` or ``` ... ```
        escaped = re.sub(
            r"```([a-zA-Z0-9_-]*)\n?(.*?)```",
            r"<pre><code class=\"language-\1\">\2</code></pre>",
            escaped,
            flags=re.DOTALL,
        )

        # Inline code: `code`
        escaped = re.sub(r"`([^`\n]+)`", r"<code>\1</code>", escaped)

        # Bold: **text**
        escaped = re.sub(r"\*\*([^*\n]+)\*\*", r"<b>\1</b>", escaped)

        # Italic: *text*
        escaped = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<i>\1</i>", escaped)

        # Headings: ### Title -> <b>Title</b>
        escaped = re.sub(r"^#{1,6}\s*(.+)$", r"<b>\1</b>", escaped, flags=re.MULTILINE)

        return escaped

    def format_message(self, message: OutboundMessage) -> Dict[str, Any]:
        """Convert OutboundMessage into Telegram Bot API sendMessage format."""
        formatted_text = self._to_telegram_html(message.text)
        payload: Dict[str, Any] = {
            "chat_id": message.conversation_id,
            "text": formatted_text,
            "parse_mode": "HTML",
        }
        if message.thread_id:
            try:
                payload["message_thread_id"] = int(message.thread_id)
            except ValueError:
                pass
        return payload

    def send_message(self, message: OutboundMessage) -> DeliveryResult:
        """Transmit message via Telegram Bot API with entity parsing fallback."""
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
                # Retry without parse_mode if entity parsing error
                if "parse entities" in str(data.get("description", "")).lower() and "parse_mode" in payload:
                    plain_payload = dict(payload)
                    plain_payload["text"] = message.text
                    del plain_payload["parse_mode"]
                    plain_req = urllib.request.Request(
                        url,
                        data=json.dumps(plain_payload).encode("utf-8"),
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )
                    with urllib.request.urlopen(plain_req, timeout=10.0) as p_resp:
                        p_data = json.loads(p_resp.read().decode("utf-8"))
                        if p_data.get("ok"):
                            msg_id = str(p_data.get("result", {}).get("message_id", "tg_sent"))
                            return DeliveryResult(success=True, platform=PlatformType.TELEGRAM, message_id=msg_id)
                return DeliveryResult(success=False, platform=PlatformType.TELEGRAM, error=str(data.get("description")))
        except urllib.error.HTTPError as he:
            try:
                err_data = json.loads(he.read().decode("utf-8"))
                if "parse entities" in str(err_data.get("description", "")).lower() and "parse_mode" in payload:
                    plain_payload = dict(payload)
                    plain_payload["text"] = message.text
                    del plain_payload["parse_mode"]
                    plain_req = urllib.request.Request(
                        url,
                        data=json.dumps(plain_payload).encode("utf-8"),
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )
                    with urllib.request.urlopen(plain_req, timeout=10.0) as p_resp:
                        p_data = json.loads(p_resp.read().decode("utf-8"))
                        if p_data.get("ok"):
                            msg_id = str(p_data.get("result", {}).get("message_id", "tg_sent"))
                            return DeliveryResult(success=True, platform=PlatformType.TELEGRAM, message_id=msg_id)
            except Exception:
                pass
            return DeliveryResult(
                success=False,
                platform=PlatformType.TELEGRAM,
                error=f"Telegram delivery error: {str(he)}",
            )
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
        title_esc = html.escape(payload.title)
        task_id_esc = html.escape(payload.task_id)
        cat_esc = html.escape(payload.category.value.upper())
        status_esc = html.escape(payload.status)
        ev_esc = html.escape(payload.evidence_summary)
        summary_esc = html.escape(payload.summary)

        card_text = (
            f"🚨 <b>Human Review Required: {title_esc}</b>\n\n"
            f"<b>Task ID:</b> <code>{task_id_esc}</code>\n"
            f"<b>Category:</b> <code>{cat_esc}</code>\n"
            f"<b>Status:</b> <code>{status_esc}</code>\n"
            f"<b>Evidence:</b> {ev_esc}\n\n"
            f"<b>Summary of Solution:</b>\n{summary_esc}\n"
        )

        if payload.patch_diff:
            diff_snippet = html.escape(payload.patch_diff[:800])
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

    def get_bot_identity(self, refresh: bool = False) -> Optional[Dict[str, Any]]:
        """Query Telegram Bot API getMe to identify authoritative bot identity.

        Cached in memory. Never logs bot token or secret credentials.
        """
        if not refresh and self._cached_bot_identity is not None:
            return self._cached_bot_identity

        if not self.bot_token:
            return self._cached_bot_identity

        url = f"https://api.telegram.org/bot{self.bot_token}/getMe"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "ShipDev-Platform-Gateway/1.0"},
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("ok"):
                    self._cached_bot_identity = data.get("result")
                    return self._cached_bot_identity
        except Exception:
            pass

        return self._cached_bot_identity

    def set_bot_identity(self, identity: Optional[Dict[str, Any]]) -> None:
        """Explicitly set or mock the cached bot identity."""
        self._cached_bot_identity = identity

    def get_bot_username(self, refresh: bool = False) -> Optional[str]:
        """Return the authoritative bot username (without @), or None if unavailable."""
        identity = self.get_bot_identity(refresh=refresh)
        if identity and identity.get("username"):
            return identity["username"].lstrip("@")
        return None

    def get_deep_link(self, workspace_id: str = "ws_personal_default", refresh: bool = False) -> str:
        """Return the start deep link for this bot and workspace."""
        username = self.get_bot_username(refresh=refresh)
        if username:
            return f"https://t.me/{username}?start={workspace_id}"
        return "https://t.me"

    def get_chat_url(self, refresh: bool = False) -> str:
        """Return the direct chat URL for this bot."""
        username = self.get_bot_username(refresh=refresh)
        if username:
            return f"https://t.me/{username}"
        return "https://t.me"

    def get_health(self) -> PlatformHealth:
        bot_username = self.get_bot_username()
        return PlatformHealth(
            platform=PlatformType.TELEGRAM,
            configured=self.is_configured(),
            status="healthy" if self.is_configured() else "unconfigured",
            details={
                "has_bot_token": bool(self.bot_token),
                "has_webhook_secret": bool(self.webhook_secret),
                "bot_username": f"@{bot_username}" if bot_username else None,
            },
        )


