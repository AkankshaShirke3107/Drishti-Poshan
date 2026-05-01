"""
Drishti Poshan - Authentication Router
Supports online login (email/password) and offline fallback (4-digit PIN).
PIN is bcrypt-hashed server-side and returned to the client for localStorage storage.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.auth import User
from app.schemas.auth import UserCreate, UserLogin, UserResponse, TokenResponse
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

logger = logging.getLogger("drishti.auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=TokenResponse, status_code=201)
async def signup(data: UserCreate, db: AsyncSession = Depends(get_db)):
    """
    Create a new user account with password + offline PIN.
    Both are bcrypt-hashed before storage.
    Returns a long-lived JWT (30 days) + hashed_pin for offline auth.
    """
    # Check if username or email already exists
    existing = await db.execute(
        select(User).where((User.username == data.username) | (User.email == data.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username or email already exists")

    # Hash both password and PIN with bcrypt
    hashed_pw = hash_password(data.password)
    hashed_pin = hash_password(data.pin)  # reuse same bcrypt function for PIN

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hashed_pw,
        pin_hash=hashed_pin,
        full_name=data.full_name,
        role=data.role,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    token = create_access_token(user.id, user.username)
    logger.info(f"New user registered: {user.username}")

    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
        hashed_pin=hashed_pin,  # client stores this for offline PIN comparison
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    """
    Authenticate user with username + password.
    Returns a long-lived JWT (30 days) + hashed_pin for offline auth fallback.
    """
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    token = create_access_token(user.id, user.username)
    logger.info(f"User logged in: {user.username}")

    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
        hashed_pin=user.pin_hash,  # send stored hash for offline comparison
    )


@router.get("/me", response_model=UserResponse)
async def get_profile(user: User = Depends(get_current_user)):
    """Get current user profile (requires auth)."""
    return user
