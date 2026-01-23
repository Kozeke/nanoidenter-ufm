from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from pydantic import BaseModel

from auth.dependencies import get_current_user
from db.users import update_user_password, update_user_profile

from auth.security import (
    hash_password,
    verify_password,
    create_access_token,
)
from db.users import create_user, get_user_by_email
from schemas.user import UpdateProfile


router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str




@router.post("/register")
def register(data: RegisterRequest):
    if get_user_by_email(data.email):
        raise HTTPException(400, "User already exists")

    create_user(
        email=data.email,
        password_hash=hash_password(data.password),
    )

    return {"status": "ok"}


@router.post("/login")
def login(data: LoginRequest):
    user = get_user_by_email(data.email)

    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")

    token = create_access_token({"sub": user["email"]})
    return {"access_token": token}



@router.get("/me")
def me(user=Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "affiliation": user["affiliation"],
        "instrument_serial_number": user["instrument_serial_number"],
        "bio": user["bio"],
        "phone_number": user["phone_number"],
        "profile_completed": user["profile_completed"],
    }



@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    user=Depends(get_current_user),
):
    # Verify current password
    if not verify_password(data.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    # Hash and update new password
    new_hash = hash_password(data.new_password)
    update_user_password(user["id"], new_hash)

    return {"status": "ok"}


@router.patch("/me")
def change_profile(
    data: UpdateProfile,
    user=Depends(get_current_user),
):
    updated_user = update_user_profile(
        user_id=user["id"],
        data=data
    )
    return updated_user
