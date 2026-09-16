"""Băm mật khẩu và cấp JWT.

Chú ý về bcrypt: thuật toán chỉ nhận tối đa 72 byte. Mật khẩu tiếng Việt có dấu
tốn 2-3 byte mỗi ký tự, nên phải cắt trước khi băm, nếu không sẽ ném ValueError.
(Không dùng passlib vì passlib 1.7.4 xung đột với bcrypt >= 4.1.)
"""
import os
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt, JWTError

SECRET = os.getenv("JWT_SECRET", "dev-secret-doi-truoc-khi-deploy")
ALGO = "HS256"
EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))

BCRYPT_MAX_BYTES = 72


def _to_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_to_bytes(password), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_to_bytes(password), hashed.encode())
    except ValueError:
        return False


def create_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGO)


def decode_token(token: str) -> int | None:
    try:
        return int(jwt.decode(token, SECRET, algorithms=[ALGO])["sub"])
    except (JWTError, KeyError, ValueError):
        return None
