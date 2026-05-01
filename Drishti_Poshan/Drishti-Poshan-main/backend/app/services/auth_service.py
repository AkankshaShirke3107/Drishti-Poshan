"""
Drishti Poshan - Authentication Service (JWT + bcrypt)
Optional auth: the app works without login. Auth is required only for profile features.

Uses native `bcrypt` library (not passlib) for Python 3.13 compatibility.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_HOURS
from app.database import get_db
from app.models.auth import User

logger = logging.getLogger("drishti.auth")

# Bearer token scheme (auto_error=False for optional auth)
security = HTTPBearer(auto_error=False)


# ─── Password Hashing (native bcrypt) ──────────────────────────

def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with auto-generated salt.

    Args:
        password: Plaintext password string (min 1 char).

    Returns:
        Bcrypt hash as a UTF-8 string, safe for DB storage.

    Raises:
        ValueError: If password is empty or not a string.
    """
    if not password or not isinstance(password, str):
        raise ValueError("Password must be a non-empty string")

    password_bytes: bytes = password.encode("utf-8")
    salt: bytes = bcrypt.gensalt(rounds=12)
    hashed: bytes = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash.

    Args:
        plain_password: The user-supplied plaintext password.
        hashed_password: The stored bcrypt hash from the database.

    Returns:
        True if the password matches, False otherwise.
    """
    if not plain_password or not hashed_password:
        return False

    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except (ValueError, TypeError) as e:
        # Catches malformed hashes or encoding issues
        logger.warning(f"Password verification error: {e}")
        return False


# ─── JWT Token Management ──────────────────────────────────────

def create_access_token(user_id: int, username: str) -> str:
    """Generate a JWT access token."""
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    payload: dict = {
        "sub": str(user_id),
        "username": username,
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token."""
    try:
        payload: dict = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ─── FastAPI Auth Dependencies ─────────────────────────────────

async def get_current_user_optional(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Optional auth dependency — returns None if no token provided."""
    if credentials is None:
        return None
    try:
        payload = decode_token(credentials.credentials)
        user_id = int(payload["sub"])
        user = await db.get(User, user_id)
        if user and user.is_active:
            return user
        return None
    except Exception:
        return None


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Required auth dependency — raises 401 if no valid token."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = decode_token(credentials.credentials)
    user_id = int(payload["sub"])
    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user
