"""
Drishti Poshan - Auth Pydantic Schemas
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    email: str = Field(..., min_length=5, max_length=200)
    password: str = Field(..., min_length=6, max_length=200)
    pin: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$",
                     description="4-digit offline PIN")
    full_name: str = Field(..., min_length=1, max_length=200)
    role: str = Field("anganwadi_worker", pattern=r"^(anganwadi_worker|supervisor)$")


class UserLogin(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    hashed_pin: Optional[str] = Field(
        None,
        description="Bcrypt-hashed PIN for offline auth (stored in localStorage)"
    )
