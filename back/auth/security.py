from datetime import datetime, timedelta
from jose import jwt, JWTError
import bcrypt
import hashlib

SECRET_KEY = "CHANGE_ME_IN_ENV"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

def _normalize_password(password: str) -> bytes:
    """Normalize to fixed length → avoid bcrypt 72-byte limit issues."""
    return hashlib.sha256(password.encode("utf-8")).digest()   # 32 bytes

def hash_password(password: str) -> str:
    normalized = _normalize_password(password)
    salt = bcrypt.gensalt(rounds=12)               # or 14, etc.
    hashed = bcrypt.hashpw(normalized, salt)
    return hashed.decode("ascii")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    normalized = _normalize_password(plain_password)
    return bcrypt.checkpw(normalized, hashed_password.encode("ascii"))

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])