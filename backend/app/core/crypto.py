"""Vetted Authenticated Encryption at Rest using AES-256-GCM.

Provides NIST-standard authenticated encryption (AEAD) for sensitive third-party tokens
(OAuth access tokens, refresh tokens) using the Python cryptography library.
"""

import base64
import os
import secrets
from typing import Optional
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from app.core.config import settings


_SALT = b"shipdev-token-encryption-v1"
_INFO = b"aes-256-gcm-at-rest"


def get_master_encryption_key() -> bytes:
    """Derive a 256-bit AES-GCM master key using HKDF-SHA256.

    Sources key material in order of priority:
    1. Dedicated settings.TOKEN_ENCRYPTION_KEY
    2. settings.API_SECRET_KEY
    3. settings.HUMAN_APPROVAL_SECRET
    """
    secret = (
        getattr(settings, "TOKEN_ENCRYPTION_KEY", None)
        or settings.API_SECRET_KEY
        or settings.HUMAN_APPROVAL_SECRET
        or "shipdev-default-secure-crypto-master-key-2026"
    )
    raw_material = secret.strip().encode("utf-8")

    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_SALT,
        info=_INFO,
    )
    return hkdf.derive(raw_material)


def encrypt_token(plaintext: str, associated_data: Optional[bytes] = None) -> str:
    """Encrypt a secret string at rest using AES-256-GCM.

    Returns base64url-encoded string: nonce (12 bytes) || ciphertext_and_tag.
    """
    if not plaintext:
        return ""

    key = get_master_encryption_key()
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(12)  # 96-bit standard nonce for GCM
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), associated_data)
    combined = nonce + ciphertext
    return base64.urlsafe_b64encode(combined).decode("utf-8")


def decrypt_token(encrypted_payload: str, associated_data: Optional[bytes] = None) -> str:
    """Decrypt an AES-256-GCM encrypted secret string.

    Fails closed and raises ValueError on tampering or invalid ciphertext.
    """
    if not encrypted_payload:
        return ""

    try:
        combined = base64.urlsafe_b64decode(encrypted_payload.encode("utf-8"))
        if len(combined) < 28:  # 12 bytes nonce + 16 bytes minimum auth tag
            raise ValueError("Ciphertext payload is too short or malformed.")

        nonce = combined[:12]
        ciphertext = combined[12:]
        key = get_master_encryption_key()
        aesgcm = AESGCM(key)
        decrypted_bytes = aesgcm.decrypt(nonce, ciphertext, associated_data)
        return decrypted_bytes.decode("utf-8")
    except Exception as e:
        raise ValueError(f"Decryption failed: cryptographic integrity check error ({str(e)})")
