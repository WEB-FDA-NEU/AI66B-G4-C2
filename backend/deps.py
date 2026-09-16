from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from models import User
from security import decode_token

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    """Bắt buộc đăng nhập. Dùng cho mọi route /me/* và các hành động ghi."""
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bạn cần đăng nhập.")
    uid = decode_token(cred.credentials)
    user = db.get(User, uid) if uid else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Phiên đăng nhập đã hết hạn.")
    return user


def get_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bạn không có quyền truy cập.")
    return user
