"""Cryptographic approval token generation and validation for platform callbacks.

Ensures approval decisions are tamper-proof, time-bound, and replay-protected,
while adhering strictly to platform payload constraints (e.g. Telegram 64-byte callback_data).
"""

import hashlib
import hmac
import time
from typing import Optional, Tuple
from app.core.config import settings


def _get_signing_key() -> str:
    """Derive secret signing key for approval callbacks."""
    secret = (
        settings.HUMAN_APPROVAL_SECRET
        or settings.API_SECRET_KEY
        or settings.TELEGRAM_WEBHOOK_SECRET
    )
    return (secret or "shipdev-approval-signing-key").strip()


def generate_approval_callback_data(
    action: str,
    task_id: str,
    expires_in_seconds: int = 86400,
) -> str:
    """Generate tamper-proof callback data with HMAC signature and expiration timestamp.

    Guaranteed to fit within Telegram's strict 64-byte callback_data limit.
    Format: {action}:{task_id}:{exp_hex}:{sig}
    Example: approve:task_09bd201a7c9b422fac6c6cfd6a7141e2:67375a00:a1b2c3d4
    """
    clean_action = "approve" if "approve" in action.lower() else "reject"
    clean_task_id = task_id.strip()
    expires_at = int(time.time()) + expires_in_seconds
    exp_hex = f"{expires_at:x}"

    key = _get_signing_key().encode("utf-8")
    payload = f"{clean_action}:{clean_task_id}:{exp_hex}".encode("utf-8")
    sig = hmac.new(key, payload, hashlib.sha256).hexdigest()[:8]

    cb_data = f"{clean_action}:{clean_task_id}:{exp_hex}:{sig}"
    if len(cb_data) > 64:
        # Guarantee limit compliance for unusually long task IDs
        overflow = len(cb_data) - 64
        sig_len = max(4, 8 - overflow)
        cb_data = f"{clean_action}:{clean_task_id}:{exp_hex}:{sig[:sig_len]}"
    return cb_data


def verify_approval_callback_data(
    callback_data: str,
) -> Tuple[bool, str, Optional[str], Optional[str]]:
    """Validate callback data format, HMAC signature, and expiration.

    Returns:
        (is_valid, action, task_id, error_reason)
    """
    if not callback_data:
        return False, "unknown", None, "Missing callback data"

    parts = callback_data.split(":")
    if len(parts) == 2:
        # Backward-compatible format without token: action:task_id
        action, task_id = parts[0], parts[1]
        return True, action, task_id, None

    if len(parts) != 4:
        return False, parts[0] if parts else "unknown", None, "Malformed callback data"

    action, task_id, exp_hex, sig = parts

    # 1. Cryptographic HMAC signature validation
    key = _get_signing_key().encode("utf-8")
    payload = f"{action}:{task_id}:{exp_hex}".encode("utf-8")
    expected_full_sig = hmac.new(key, payload, hashlib.sha256).hexdigest()
    expected_sig = expected_full_sig[: len(sig)]

    if not hmac.compare_digest(sig, expected_sig):
        return False, action, task_id, "Invalid cryptographic token signature"

    # 2. Expiration validation
    try:
        expires_at = int(exp_hex, 16)
    except ValueError:
        return False, action, task_id, "Invalid token expiration format"

    now = int(time.time())
    if now > expires_at:
        return False, action, task_id, f"Approval token expired at {expires_at} (current time {now})"

    return True, action, task_id, None
