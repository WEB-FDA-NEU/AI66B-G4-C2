"""FastAPI dependencies — JWT auth via HttpOnly cookie."""
from __future__ import annotations

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from db import get_db
from models import User
from security import COOKIE_NAME, decode_token


def get_current_user_optional(
    token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User | None:
    """Returns the User if the cookie is valid, else None. Never raises."""
    if not token:
        return None
    uid = decode_token(token)
    if not uid:
        return None
    return db.get(User, uid)


def get_current_user(
    user: User | None = Depends(get_current_user_optional),
) -> User:
    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "You must be logged in."
        )
    return user


def get_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Admin only."
        )
    return user