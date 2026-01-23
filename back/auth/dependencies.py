from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError

from auth.security import decode_token
from db.users import get_user_by_email

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    token = credentials.credentials

    try:
        payload = decode_token(token)
        email = payload.get("sub")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = get_user_by_email(email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # 🔐 Explicit return shape (important)
    return {
        "id": user["id"],
        "email": user["email"],
        "password_hash": user["password_hash"],  # needed for change-password
        "full_name": user["full_name"],
        "affiliation": user["affiliation"],
        "instrument_serial_number": user["instrument_serial_number"],
        "bio": user["bio"],
        "phone_number": user["phone_number"],
        "profile_completed": user["profile_completed"]
    }


def require_completed_profile(current_user=Depends(get_current_user)):
    if not current_user["profile_completed"]:
        raise HTTPException(
            status_code=403,
            detail="Profile not completed"
        )
    return current_user
