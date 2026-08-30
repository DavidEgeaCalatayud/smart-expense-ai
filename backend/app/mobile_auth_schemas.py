from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas import UserResponse


class MobileRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=12, max_length=128)
    displayName: str = Field(..., min_length=1, max_length=120)
    deviceId: UUID


class MobileLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)
    deviceId: UUID


class MobileRefreshRequest(BaseModel):
    refreshToken: str = Field(..., min_length=32, max_length=512)
    deviceId: UUID


class MobileLogoutRequest(BaseModel):
    refreshToken: str = Field(..., min_length=32, max_length=512)
    deviceId: UUID


class MobileTokenResponse(BaseModel):
    user: UserResponse
    tokenType: Literal["Bearer"] = "Bearer"
    accessToken: str
    expiresIn: int
    refreshToken: str
